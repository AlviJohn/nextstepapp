from datetime import date, datetime, timezone
from datetime import date as Date
from typing import Optional

from sqlalchemy import Index, UniqueConstraint
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utc_from_ts(ts: int) -> datetime:
    return datetime.fromtimestamp(ts, timezone.utc).replace(tzinfo=None)


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=255)
    name: str = Field(default="", max_length=120)
    password_hash: str = ""  # empty for accounts that only sign in with Google
    google_sub: Optional[str] = Field(default=None, index=True, unique=True, max_length=64)
    plan: str = Field(default="free", max_length=20)  # free | pro
    plan_interval: Optional[str] = Field(default=None, max_length=20)  # monthly | yearly
    plan_renews_at: Optional[datetime] = None
    razorpay_subscription_id: Optional[str] = Field(default=None, index=True, max_length=64)
    created_at: datetime = Field(default_factory=utcnow)


class Task(SQLModel, table=True):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_user_status", "user_id", "status"),
        Index("ix_tasks_user_focus", "user_id", "focus_date"),
        Index("ix_tasks_user_done", "user_id", "done_date"),
        UniqueConstraint("template_id", "instance_date", name="uq_tasks_routine_instance"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    title: str = Field(max_length=280)
    notes: str = Field(default="", max_length=2000)
    status: str = Field(default="open", max_length=10)  # open | done

    # Set when the task is chosen as one of the day's priorities.
    focus_date: Optional[date] = None
    rank: Optional[int] = None

    done_date: Optional[date] = None  # user's local date when completed
    done_at: Optional[datetime] = None

    # Planning signals used to propose the day's three.
    importance: Optional[int] = None  # 1 (low) … 5 (critical)
    size: Optional[str] = Field(default=None, max_length=2)  # XS | S | M | L | XL

    focus_seconds: int = 0
    pomodoros: int = 0

    # Routines (Pro): a template task with a recurrence rule spawns one
    # instance per matching day. Templates never show up as actionable tasks.
    is_template: bool = False
    recurrence: str = Field(default="none", max_length=12)  # none | daily | weekdays | weekly
    recurrence_day: Optional[int] = None  # 0=Mon … 6=Sun, for weekly
    template_id: Optional[int] = Field(default=None, foreign_key="tasks.id")
    instance_date: Optional[date] = None

    created_at: datetime = Field(default_factory=utcnow)


class Payment(SQLModel, table=True):
    """One row per successful one-time payment. The unique payment ID makes granting
    Pro idempotent across the browser callback and the webhook."""

    __tablename__ = "payments"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    provider_payment_id: str = Field(unique=True, max_length=64)
    provider_order_id: str = Field(max_length=64)
    amount: int  # smallest currency unit (paise / cents)
    currency: str = Field(max_length=3)
    interval: str = Field(max_length=10)
    created_at: datetime = Field(default_factory=utcnow)


class FocusSession(SQLModel, table=True):
    __tablename__ = "focus_sessions"
    __table_args__ = (Index("ix_focus_user_date", "user_id", "date"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    task_id: Optional[int] = Field(default=None, foreign_key="tasks.id")
    date: Date
    seconds: int
    completed: bool = True  # a full pomodoro vs. an interrupted one
    created_at: datetime = Field(default_factory=utcnow)


class DayReview(SQLModel, table=True):
    __tablename__ = "day_reviews"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_review_user_date"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    date: Date
    mood: Optional[int] = None  # 1–5
    wins: str = Field(default="", max_length=2000)
    blockers: str = Field(default="", max_length=2000)
    tomorrow: str = Field(default="", max_length=2000)
    updated_at: datetime = Field(default_factory=utcnow)
