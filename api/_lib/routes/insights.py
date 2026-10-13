from collections import defaultdict
from datetime import date, timedelta
from typing import Dict, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func
from sqlmodel import Session, select

from .. import config
from ..db import get_session
from ..models import DayReview, FocusSession, Task, User
from ..schemas import DaySummary, WeeklyReport
from ..security import current_user, is_pro, require_pro

router = APIRouter(prefix="/api/insights", tags=["insights"])


def summaries(session: Session, user: User, start: date, end: date) -> List[DaySummary]:
    """Per-day rollup over [start, end] using three range queries, no matter the span."""
    done = session.exec(
        select(Task.done_date, Task.title)
        .where(Task.user_id == user.id, Task.done_date >= start, Task.done_date <= end)
        .order_by(Task.done_at)
    ).all()
    focus = session.exec(
        select(
            FocusSession.date,
            func.sum(FocusSession.seconds),
            func.sum(case((FocusSession.completed == True, 1), else_=0)),  # noqa: E712
        )
        .where(FocusSession.user_id == user.id, FocusSession.date >= start, FocusSession.date <= end)
        .group_by(FocusSession.date)
    ).all()
    moods = session.exec(
        select(DayReview.date, DayReview.mood).where(
            DayReview.user_id == user.id, DayReview.date >= start, DayReview.date <= end
        )
    ).all()

    titles: Dict[date, List[str]] = defaultdict(list)
    for d, title in done:
        titles[d].append(title)
    focus_by_day = {d: (int(s or 0), int(p or 0)) for d, s, p in focus}
    mood_by_day = dict(moods)

    out = []
    day = start
    while day <= end:
        secs, poms = focus_by_day.get(day, (0, 0))
        out.append(
            DaySummary(
                date=day,
                completed=len(titles[day]),
                focus_minutes=secs // 60,
                pomodoros=poms,
                mood=mood_by_day.get(day),
                tasks=titles[day][:20],
            )
        )
        day += timedelta(days=1)
    return out


def completion_streak(session: Session, user: User, end: date) -> int:
    days = set(
        session.exec(
            select(Task.done_date)
            .where(
                Task.user_id == user.id,
                Task.done_date <= end,
                Task.done_date > end - timedelta(days=366),
            )
            .distinct()
        ).all()
    )
    # A streak survives until the end of today, so start from yesterday if today is empty.
    cursor = end if end in days else end - timedelta(days=1)
    streak = 0
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


@router.get("/weekly", response_model=WeeklyReport)
def weekly(
    end: date = Query(...),
    user: User = Depends(require_pro),
    session: Session = Depends(get_session),
):
    start = end - timedelta(days=6)
    days = summaries(session, user, start, end)
    prev_completed = session.exec(
        select(func.count())
        .select_from(Task)
        .where(
            Task.user_id == user.id,
            Task.done_date >= start - timedelta(days=7),
            Task.done_date < start,
        )
    ).one()
    moods = [d.mood for d in days if d.mood]
    best = max(days, key=lambda d: (d.completed, d.focus_minutes))
    return WeeklyReport(
        start=start,
        end=end,
        days=days,
        total_completed=sum(d.completed for d in days),
        total_focus_minutes=sum(d.focus_minutes for d in days),
        total_pomodoros=sum(d.pomodoros for d in days),
        avg_mood=round(sum(moods) / len(moods), 1) if moods else None,
        streak=completion_streak(session, user, end),
        best_day=best.date if best.completed else None,
        previous_week_completed=int(prev_completed),
    )


@router.get("/history")
def history(
    end: date = Query(...),
    days: int = Query(30, ge=1, le=90),
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """Free plans see the last week; Pro unlocks up to 90 days."""
    pro = is_pro(user)
    span = days if pro else min(days, config.FREE_HISTORY_DAYS)
    rows = summaries(session, user, end - timedelta(days=span - 1), end)
    active = [r for r in reversed(rows) if r.completed or r.focus_minutes or r.mood]
    return {
        "days": active,
        "limited": not pro and days > config.FREE_HISTORY_DAYS,
        "streak": completion_streak(session, user, end),
    }
