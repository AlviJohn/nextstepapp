from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from .. import config
from ..db import get_session
from ..models import FocusSession, Task, User, utcnow
from ..schemas import DateIn, TaskIn, TaskOut, TaskPatch
from ..security import current_user, is_pro

router = APIRouter(prefix="/api", tags=["tasks"])

PRIORITY_COUNT = 3  # the first three tasks on today's list are the priorities


def task_out(task: Task) -> TaskOut:
    # from_attributes reloads expired ORM attributes; model_dump() would not.
    return TaskOut.model_validate(task)


def get_owned_task(session: Session, user: User, task_id: int) -> Task:
    task = session.get(Task, task_id)
    if not task or task.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return task


def routine_matches(template: Task, day: date) -> bool:
    wd = day.weekday()
    if template.recurrence == "daily":
        return True
    if template.recurrence == "weekdays":
        return wd < 5
    if template.recurrence == "weekly":
        return wd == template.recurrence_day
    return False


def materialize_routines(session: Session, user: User, day: date) -> None:
    """Create today's instance of each routine, once. Idempotent and race-safe via
    the (template_id, instance_date) unique constraint."""
    if not is_pro(user):
        return
    templates = session.exec(
        select(Task).where(Task.user_id == user.id, Task.is_template == True)  # noqa: E712
    ).all()
    due = [t for t in templates if routine_matches(t, day)]
    if not due:
        return
    existing = set(
        session.exec(
            select(Task.template_id).where(
                Task.template_id.in_([t.id for t in due]), Task.instance_date == day
            )
        ).all()
    )
    created = False
    for t in due:
        if t.id in existing:
            continue
        session.add(
            Task(
                user_id=user.id,
                title=t.title,
                notes=t.notes,
                importance=t.importance,
                size=t.size,
                template_id=t.id,
                instance_date=day,
            )
        )
        created = True
    if created:
        try:
            session.commit()
        except IntegrityError:
            session.rollback()  # a concurrent request already created them


@router.get("/tasks", response_model=List[TaskOut])
def list_tasks(user: User = Depends(current_user), session: Session = Depends(get_session)):
    tasks = session.exec(
        select(Task)
        .where(Task.user_id == user.id, Task.status == "open", Task.is_template == False)  # noqa: E712
        .order_by(Task.created_at.desc())
        .limit(500)
    ).all()
    return [task_out(t) for t in tasks]


@router.get("/routines", response_model=List[TaskOut])
def list_routines(user: User = Depends(current_user), session: Session = Depends(get_session)):
    tasks = session.exec(
        select(Task)
        .where(Task.user_id == user.id, Task.is_template == True)  # noqa: E712
        .order_by(Task.created_at)
    ).all()
    return [task_out(t) for t in tasks]


@router.post("/tasks", response_model=TaskOut, status_code=201)
def create_task(
    body: TaskIn, user: User = Depends(current_user), session: Session = Depends(get_session)
):
    title = body.title.strip()
    if not title:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Title is required")

    if body.recurrence != "none":
        if not is_pro(user):
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                {"code": "pro_required", "message": "Routines are a NextStep Pro feature."},
            )
        if body.recurrence == "weekly" and body.recurrence_day is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pick a day for weekly routines")
        template = Task(
            user_id=user.id,
            title=title,
            notes=body.notes,
            importance=body.importance,
            size=body.size,
            is_template=True,
            recurrence=body.recurrence,
            recurrence_day=body.recurrence_day if body.recurrence == "weekly" else None,
        )
        session.add(template)
        session.commit()
        session.refresh(template)
        if body.date:
            materialize_routines(session, user, body.date)
        return task_out(template)

    if not is_pro(user):
        open_count = session.exec(
            select(func.count())
            .select_from(Task)
            .where(Task.user_id == user.id, Task.status == "open", Task.is_template == False)  # noqa: E712
        ).one()
        if open_count >= config.FREE_OPEN_TASK_LIMIT:
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                {
                    "code": "pro_required",
                    "message": f"Free plan holds {config.FREE_OPEN_TASK_LIMIT} open tasks. "
                    "Finish a few, or go Pro for unlimited.",
                },
            )

    task = Task(user_id=user.id, title=title, notes=body.notes, importance=body.importance, size=body.size)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task_out(task)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    body: TaskPatch,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    task = get_owned_task(session, user, task_id)
    if body.title is not None:
        task.title = body.title.strip() or task.title
    if body.notes is not None:
        task.notes = body.notes
    if "importance" in body.model_fields_set:
        task.importance = body.importance
    if "size" in body.model_fields_set:
        task.size = body.size
    session.add(task)
    session.commit()
    session.refresh(task)
    return task_out(task)


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, user: User = Depends(current_user), session: Session = Depends(get_session)):
    task = get_owned_task(session, user, task_id)
    session.exec(update(FocusSession).where(FocusSession.task_id == task.id).values(task_id=None))
    if task.is_template:
        session.exec(update(Task).where(Task.template_id == task.id).values(template_id=None))
    session.delete(task)
    session.commit()


@router.post("/tasks/{task_id}/complete", response_model=TaskOut)
def complete_task(
    task_id: int, body: DateIn, user: User = Depends(current_user), session: Session = Depends(get_session)
):
    task = get_owned_task(session, user, task_id)
    if task.is_template:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Routines can't be completed directly")
    task.status = "done"
    task.done_date = body.date
    task.done_at = utcnow()
    session.add(task)
    session.commit()
    session.refresh(task)
    return task_out(task)


@router.post("/tasks/{task_id}/reopen", response_model=TaskOut)
def reopen_task(task_id: int, user: User = Depends(current_user), session: Session = Depends(get_session)):
    task = get_owned_task(session, user, task_id)
    task.status = "open"
    task.done_date = None
    task.done_at = None
    session.add(task)
    session.commit()
    session.refresh(task)
    return task_out(task)


@router.post("/tasks/{task_id}/skip", response_model=TaskOut)
def skip_task(
    task_id: int, body: DateIn, user: User = Depends(current_user), session: Session = Depends(get_session)
):
    """Push a task back within its group: a priority goes behind the other priorities
    (never below the extras), an extra goes to the end of the list."""
    task = get_owned_task(session, user, task_id)
    if task.focus_date != body.date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Task isn't on today's list")
    ordered = list(
        session.exec(
            select(Task).where(Task.user_id == user.id, Task.focus_date == body.date).order_by(Task.rank, Task.id)
        ).all()
    )
    idx = next(i for i, t in enumerate(ordered) if t.id == task.id)
    ordered.pop(idx)
    target = PRIORITY_COUNT - 1 if idx < PRIORITY_COUNT else len(ordered)
    ordered.insert(min(target, len(ordered)), task)
    for rank, t in enumerate(ordered, start=1):
        if t.rank != rank:
            t.rank = rank
            session.add(t)
    session.commit()
    session.refresh(task)
    return task_out(task)
