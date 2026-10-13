from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func
from sqlmodel import Session, select

from ..db import get_session
from ..models import DayReview, FocusSession, Task, User, utcnow
from ..planner import propose, rank
from ..schemas import FocusSessionIn, PrioritiesIn, ReviewIn, ReviewOut, SuggestOut, Suggestion, TodayOut
from ..security import current_user
from .tasks import PRIORITY_COUNT, get_owned_task, materialize_routines, task_out

router = APIRouter(prefix="/api", tags=["day"])


def build_today(session: Session, user: User, day: date) -> TodayOut:
    priorities = session.exec(
        select(Task)
        .where(Task.user_id == user.id, Task.focus_date == day)
        .order_by(Task.rank, Task.id)
    ).all()
    done_today = session.exec(
        select(Task)
        .where(Task.user_id == user.id, Task.done_date == day)
        .order_by(Task.done_at)
    ).all()
    carryover = session.exec(
        select(Task)
        .where(
            Task.user_id == user.id,
            Task.status == "open",
            Task.focus_date < day,
            Task.is_template == False,  # noqa: E712
        )
        .order_by(Task.focus_date.desc(), Task.rank)
        .limit(10)
    ).all()
    seconds, pomodoros = session.exec(
        select(
            func.coalesce(func.sum(FocusSession.seconds), 0),
            func.coalesce(func.sum(case((FocusSession.completed == True, 1), else_=0)), 0),  # noqa: E712
        ).where(FocusSession.user_id == user.id, FocusSession.date == day)
    ).one()
    has_review = (
        session.exec(
            select(DayReview.id).where(DayReview.user_id == user.id, DayReview.date == day)
        ).first()
        is not None
    )
    inbox_count = session.exec(
        select(func.count())
        .select_from(Task)
        .where(
            Task.user_id == user.id,
            Task.status == "open",
            Task.is_template == False,  # noqa: E712
            (Task.focus_date == None) | (Task.focus_date != day),  # noqa: E711
        )
    ).one()
    next_task = next((t for t in priorities if t.status == "open"), None)
    return TodayOut(
        date=day,
        priorities=[task_out(t) for t in priorities],
        next=task_out(next_task) if next_task else None,
        done_today=[task_out(t) for t in done_today],
        carryover=[task_out(t) for t in carryover],
        focus_seconds_today=int(seconds),
        pomodoros_today=int(pomodoros),
        has_review=has_review,
        inbox_count=int(inbox_count),
    )


@router.get("/today", response_model=TodayOut)
def today(
    day: date = Query(alias="date"),
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """Everything the Focus screen needs in one round trip."""
    materialize_routines(session, user, day)
    return build_today(session, user, day)


@router.get("/today/suggest", response_model=SuggestOut)
def suggest(
    day: date = Query(alias="date"),
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """Propose tasks for whatever priority spots are still open today."""
    on_today = session.exec(
        select(Task).where(Task.user_id == user.id, Task.focus_date == day).order_by(Task.rank, Task.id)
    ).all()
    top = on_today[:PRIORITY_COUNT]
    slots = PRIORITY_COUNT - len(top)
    if slots <= 0:
        return SuggestOut(slots=0, suggestions=[])
    candidates = session.exec(
        select(Task)
        .where(
            Task.user_id == user.id,
            Task.status == "open",
            Task.is_template == False,  # noqa: E712
            (Task.focus_date == None) | (Task.focus_date != day),  # noqa: E711
        )
        .limit(500)
    ).all()
    big_already = sum(1 for t in top if t.size in ("L", "XL"))
    picked = propose(list(candidates), slots, day, big_already)
    picked_ids = {t.id for t, _, _ in picked}
    alternates = [x for x in rank(list(candidates), day) if x[0].id not in picked_ids][:8]
    return SuggestOut(
        slots=slots,
        suggestions=[Suggestion(task=task_out(t), score=sc, reason=why) for t, sc, why in picked],
        alternates=[Suggestion(task=task_out(t), score=sc, reason=why) for t, sc, why in alternates],
    )


@router.put("/today/priorities", response_model=TodayOut)
def set_priorities(
    body: PrioritiesIn, user: User = Depends(current_user), session: Session = Depends(get_session)
):
    ids = list(dict.fromkeys(body.task_ids))
    tasks = {t.id: t for t in (get_owned_task(session, user, i) for i in ids)}
    for t in tasks.values():
        if t.is_template or t.status != "open":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"'{t.title}' can't be a priority")

    current = session.exec(
        select(Task).where(Task.user_id == user.id, Task.focus_date == body.date)
    ).all()
    done_ranks = [t.rank or 0 for t in current if t.status == "done"]
    for t in current:
        if t.status == "open" and t.id not in tasks:
            t.focus_date = None
            t.rank = None
            session.add(t)

    base = max(done_ranks, default=0)
    for i, task_id in enumerate(ids, start=1):
        t = tasks[task_id]
        t.focus_date = body.date
        t.rank = base + i
        session.add(t)
    session.commit()
    return build_today(session, user, body.date)


@router.post("/focus", status_code=201)
def log_focus(body: FocusSessionIn, user: User = Depends(current_user), session: Session = Depends(get_session)):
    task = get_owned_task(session, user, body.task_id) if body.task_id else None
    session.add(
        FocusSession(
            user_id=user.id,
            task_id=task.id if task else None,
            date=body.date,
            seconds=body.seconds,
            completed=body.completed,
        )
    )
    if task:
        task.focus_seconds += body.seconds
        if body.completed:
            task.pomodoros += 1
        session.add(task)
    session.commit()
    return {"ok": True}


@router.get("/reviews/{day}", response_model=ReviewOut)
def get_review(day: date, user: User = Depends(current_user), session: Session = Depends(get_session)):
    review = session.exec(
        select(DayReview).where(DayReview.user_id == user.id, DayReview.date == day)
    ).first()
    if not review:
        return ReviewOut(date=day)
    return ReviewOut(
        date=day, mood=review.mood, wins=review.wins, blockers=review.blockers, tomorrow=review.tomorrow
    )


@router.put("/reviews/{day}", response_model=ReviewOut)
def save_review(
    day: date, body: ReviewIn, user: User = Depends(current_user), session: Session = Depends(get_session)
):
    review = session.exec(
        select(DayReview).where(DayReview.user_id == user.id, DayReview.date == day)
    ).first() or DayReview(user_id=user.id, date=day)
    review.mood = body.mood
    review.wins = body.wins
    review.blockers = body.blockers
    review.tomorrow = body.tomorrow
    review.updated_at = utcnow()
    session.add(review)
    session.commit()
    return ReviewOut(date=day, **body.model_dump())
