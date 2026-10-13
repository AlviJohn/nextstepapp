from datetime import date as Date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

Recurrence = Literal["none", "daily", "weekdays", "weekly"]
Size = Literal["XS", "S", "M", "L", "XL"]


class SignupIn(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(min_length=8, max_length=200)
    name: str = Field(default="", max_length=120)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1] or " " in v:
            raise ValueError("Enter a valid email")
        return v


class LoginIn(BaseModel):
    email: str
    password: str


class GoogleIn(BaseModel):
    credential: str = Field(max_length=4096)  # ID token from Google Identity Services


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    plan: str
    plan_interval: Optional[str]
    plan_renews_at: Optional[datetime]
    is_pro: bool


class AuthOut(BaseModel):
    token: str
    user: UserOut


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=280)
    notes: str = Field(default="", max_length=2000)
    recurrence: Recurrence = "none"
    recurrence_day: Optional[int] = Field(default=None, ge=0, le=6)
    importance: Optional[int] = Field(default=None, ge=1, le=5)
    size: Optional[Size] = None
    date: Optional[Date] = None  # client's local date, used to spawn today's routine instance


class TaskPatch(BaseModel):
    """Only fields that are sent are changed; send null to clear importance or size."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=280)
    notes: Optional[str] = Field(default=None, max_length=2000)
    importance: Optional[int] = Field(default=None, ge=1, le=5)
    size: Optional[Size] = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    notes: str
    status: str
    focus_date: Optional[Date]
    rank: Optional[int]
    done_date: Optional[Date]
    importance: Optional[int]
    size: Optional[str]
    focus_seconds: int
    pomodoros: int
    is_template: bool
    recurrence: str
    recurrence_day: Optional[int]
    template_id: Optional[int]
    created_at: datetime


class DateIn(BaseModel):
    date: Date


MAX_TODAY = 10  # open tasks on today's list; the first three are the priorities


class PrioritiesIn(BaseModel):
    """Today's open tasks in order. The first three (after any already finished)
    are the day's priorities; the rest are "if there's time" extras."""

    date: Date
    task_ids: List[int] = Field(max_length=MAX_TODAY)


class TodayOut(BaseModel):
    date: Date
    priorities: List[TaskOut]
    next: Optional[TaskOut]
    done_today: List[TaskOut]
    carryover: List[TaskOut]
    focus_seconds_today: int
    pomodoros_today: int
    has_review: bool
    inbox_count: int  # open tasks not on today's list (for "suggest" and empty states)


class Suggestion(BaseModel):
    task: TaskOut
    score: float
    reason: str


class SuggestOut(BaseModel):
    slots: int  # how many priority spots are still open today
    suggestions: List[Suggestion]
    alternates: List[Suggestion] = []  # next-best tasks, in order, for swapping a pick


class FocusSessionIn(BaseModel):
    task_id: Optional[int] = None
    date: Date
    seconds: int = Field(ge=1, le=4 * 3600)
    completed: bool = True


class ReviewIn(BaseModel):
    mood: Optional[int] = Field(default=None, ge=1, le=5)
    wins: str = Field(default="", max_length=2000)
    blockers: str = Field(default="", max_length=2000)
    tomorrow: str = Field(default="", max_length=2000)


class ReviewOut(ReviewIn):
    date: Date


class DaySummary(BaseModel):
    date: Date
    completed: int
    focus_minutes: int
    pomodoros: int
    mood: Optional[int]
    tasks: List[str]


class WeeklyReport(BaseModel):
    start: Date
    end: Date
    days: List[DaySummary]
    total_completed: int
    total_focus_minutes: int
    total_pomodoros: int
    avg_mood: Optional[float]
    streak: int
    best_day: Optional[Date]
    previous_week_completed: int


class UpgradeIn(BaseModel):
    interval: Literal["monthly", "yearly"] = "monthly"
    currency: Literal["INR", "USD"] = "INR"
