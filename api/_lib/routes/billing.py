"""Plans and payments.

Razorpay Subscriptions is used when its env vars are set. Otherwise, outside
production, a demo mode flips users to Pro instantly so gating can be tested.

`set_plan` is the only place a plan changes. The checkout callback gives the user
Pro immediately; the webhook is the source of truth for renewals and cancellations.
"""
import base64
import hashlib
import hmac
import json
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlmodel import Session, select

from .. import config
from ..db import get_session
from ..models import User, utc_from_ts, utcnow
from ..schemas import UpgradeIn, UserOut
from ..security import current_user, is_pro
from .auth import user_out

router = APIRouter(prefix="/api/billing", tags=["billing"])

# Display prices. Keep in sync with the plans you create in Razorpay.
PRICES = {
    "INR": {"monthly": 299, "yearly": 1788},  # yearly = ₹149/month
    "USD": {"monthly": 5, "yearly": 36},  # yearly = $3/month
}
PERIOD_DAYS = {"monthly": 31, "yearly": 366}


def set_plan(session: Session, user: User, plan: str, interval: Optional[str], renews_at: Optional[datetime]):
    user.plan = plan
    user.plan_interval = interval
    user.plan_renews_at = renews_at
    session.add(user)
    session.commit()
    session.refresh(user)


def _razorpay(method: str, path: str, payload: Optional[dict] = None) -> dict:
    auth = base64.b64encode(f"{config.RAZORPAY_KEY_ID}:{config.RAZORPAY_KEY_SECRET}".encode()).decode()
    req = urllib.request.Request(
        f"https://api.razorpay.com/v1{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        method=method,
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="ignore")[:300]
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Payment provider error: {detail}")


def _hmac(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


@router.get("/config")
def billing_config():
    provider = "razorpay" if config.RAZORPAY_ENABLED else "demo" if config.DEMO_BILLING else "none"
    available = [
        f"{cur}_{interval}"
        for (cur, interval), plan_id in config.RAZORPAY_PLANS.items()
        if plan_id or provider == "demo"
    ]
    return {"provider": provider, "prices": PRICES, "available": available}


@router.post("/checkout")
def checkout(body: UpgradeIn, user: User = Depends(current_user), session: Session = Depends(get_session)):
    if is_pro(user):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You're already on Pro")

    if config.RAZORPAY_ENABLED:
        plan_id = config.RAZORPAY_PLANS.get((body.currency, body.interval))
        if not plan_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That plan isn't available yet")
        sub = _razorpay(
            "POST",
            "/subscriptions",
            {
                "plan_id": plan_id,
                "total_count": 10 if body.interval == "yearly" else 120,
                "customer_notify": 1,
                "notes": {"user_id": str(user.id), "interval": body.interval, "currency": body.currency},
            },
        )
        user.razorpay_subscription_id = sub["id"]
        session.add(user)
        session.commit()
        return {
            "provider": "razorpay",
            "key_id": config.RAZORPAY_KEY_ID,
            "subscription_id": sub["id"],
            "email": user.email,
            "name": user.name,
        }

    if config.DEMO_BILLING:
        renews = utcnow() + timedelta(days=PERIOD_DAYS[body.interval])
        set_plan(session, user, "pro", body.interval, renews)
        return {"provider": "demo", "user": user_out(user)}

    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Payments are launching soon.")


class VerifyIn(BaseModel):
    razorpay_payment_id: str
    razorpay_subscription_id: str
    razorpay_signature: str


@router.post("/verify", response_model=UserOut)
def verify(body: VerifyIn, user: User = Depends(current_user), session: Session = Depends(get_session)):
    """Called by the browser after Razorpay Checkout succeeds."""
    if not config.RAZORPAY_ENABLED or body.razorpay_subscription_id != user.razorpay_subscription_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown subscription")
    expected = _hmac(
        config.RAZORPAY_KEY_SECRET,
        f"{body.razorpay_payment_id}|{body.razorpay_subscription_id}".encode(),
    )
    if not hmac.compare_digest(expected, body.razorpay_signature):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payment signature mismatch")
    sub = _razorpay("GET", f"/subscriptions/{body.razorpay_subscription_id}")
    interval = (sub.get("notes") or {}).get("interval", "monthly")
    current_end = sub.get("current_end")
    renews = (
        utc_from_ts(current_end)
        if current_end
        else utcnow() + timedelta(days=PERIOD_DAYS[interval])
    )
    set_plan(session, user, "pro", interval, renews)
    return user_out(user)


@router.post("/webhook", include_in_schema=False)
async def webhook(request: Request, session: Session = Depends(get_session)):
    """Razorpay → Settings → Webhooks. Subscribe to subscription.* events."""
    raw = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    if not config.RAZORPAY_WEBHOOK_SECRET or not hmac.compare_digest(
        _hmac(config.RAZORPAY_WEBHOOK_SECRET, raw), signature
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bad signature")

    event = json.loads(raw)
    sub = event.get("payload", {}).get("subscription", {}).get("entity", {})
    if not sub.get("id"):
        return {"ok": True}
    user = session.exec(select(User).where(User.razorpay_subscription_id == sub["id"])).first()
    if not user:
        return {"ok": True}

    interval = (sub.get("notes") or {}).get("interval", user.plan_interval or "monthly")
    current_end = utc_from_ts(sub["current_end"]) if sub.get("current_end") else None
    name = event.get("event", "")
    if name in ("subscription.activated", "subscription.charged", "subscription.resumed"):
        set_plan(session, user, "pro", interval, current_end)
    elif name == "subscription.cancelled":
        # Keep Pro until the paid period ends; is_pro() checks plan_renews_at.
        set_plan(session, user, "pro", interval, current_end or utcnow())
    elif name in ("subscription.halted", "subscription.completed", "subscription.paused"):
        set_plan(session, user, "free", None, None)
    return {"ok": True}


@router.post("/cancel", response_model=UserOut)
def cancel(user: User = Depends(current_user), session: Session = Depends(get_session)):
    if config.RAZORPAY_ENABLED and user.razorpay_subscription_id:
        _razorpay("POST", f"/subscriptions/{user.razorpay_subscription_id}/cancel", {"cancel_at_cycle_end": 1})
        # Access continues until plan_renews_at; the webhook confirms.
        return user_out(user)
    set_plan(session, user, "free", None, None)
    return user_out(user)
