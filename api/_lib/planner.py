"""Proposes the day's three from the user's open tasks.

Ranking, in order of weight:
  1. Priority (1–5). Unset counts as 3.
  2. Size. Smaller tasks win ties, so quick high-value work comes first. Unset counts as M.
  3. Carried over from an earlier day, or waiting a long time: a small nudge so
     important-but-avoided tasks resurface.

A day holds at most one L/XL task, so the three stay finishable, unless there's
nothing else to suggest.
"""
from datetime import date
from typing import List, Tuple

from .models import Task

SIZES = ["XS", "S", "M", "L", "XL"]
SIZE_LABEL = {"XS": "tiny", "S": "quick", "M": "medium", "L": "big", "XL": "very big"}
_EASE = {"XS": 1.0, "S": 0.75, "M": 0.5, "L": 0.25, "XL": 0.0}
_BIG = {"L", "XL"}


def score(task: Task, today: date) -> Tuple[float, str]:
    importance = task.importance or 3
    size = task.size or "M"
    age_days = max(0, (today - task.created_at.date()).days)
    carried = task.focus_date is not None and task.focus_date < today

    value = importance * 2 + _EASE[size] + min(age_days, 14) / 14 * 0.5 + (0.75 if carried else 0)

    parts = [f"Priority {importance}" if task.importance else "No priority set"]
    if task.size:
        parts.append(f"{SIZE_LABEL[size]} ({size})")
    if carried:
        parts.append("carried over")
    elif age_days >= 5:
        parts.append(f"waiting {age_days} days")
    return round(value, 2), " · ".join(parts)


def rank(candidates: List[Task], today: date) -> List[Tuple[Task, float, str]]:
    return sorted(
        ((t, *score(t, today)) for t in candidates),
        key=lambda x: (-x[1], x[0].created_at),
    )


def propose(candidates: List[Task], slots: int, today: date, big_already: int = 0) -> List[Tuple[Task, float, str]]:
    ranked = rank(candidates, today)
    picked: List[Tuple[Task, float, str]] = []
    deferred: List[Tuple[Task, float, str]] = []
    big = big_already
    for item in ranked:
        if len(picked) == slots:
            break
        if (item[0].size or "M") in _BIG:
            if big >= 1:
                deferred.append(item)
                continue
            big += 1
        picked.append(item)
    # Not enough small/medium tasks? Fall back to the big ones rather than leave a slot empty.
    picked.extend(deferred[: slots - len(picked)])
    return picked
