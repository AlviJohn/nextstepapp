"""Plans and payments.

Three modes, picked from env vars:
  - Razorpay Subscriptions (keys + plan IDs): auto-renewing Pro.
  - Razorpay one-time pass (keys only): pay once for 1 month or 1 year of Pro,
    using the Orders API. Works before Razorpay enables Subscriptions on an account.
  - Demo (no keys, never in production): upgrading is instant and free.

`set_plan` is the only place a plan changes. For subscriptions the webhook is the
source of truth for renewals. For passes, `grant_pass` is idempotent per payment,
so the browser callback and the `order.paid` webhook can both call it safely.
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
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from .. import config
from ..db import get_session
from ..models import Payment, User, utc_from_ts, utcnow
from ..schemas import UpgradeIn, UserOut
from ..security import current_user, is_pro
from .auth import is_local_dev, user_out

router = APIRouter(prefix="/api/billing", tags=["billing"])

# Prices in whole units. Keep in sync with the plans you create in Razorpay.
PRICES = {
    "INR": {"monthly": 299, "yearly": 1788},  # yearly = ₹149/month
    "USD": {"monthly": 5, "yearly": 36},  # yearly = $3/month
}
PERIOD_DAYS = {"monthly": 31, "yearly": 366}


def _mode() -> str:
    if config.RAZORPAY_SUBSCRIPTIONS:
        return "subscription"
    if config.RAZORPAY_ENABLED:
        return "one_time"
    return "demo" if config.DEMO_BILLING else "none"


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
        raw = e.read().decode(errors="ignore")
        try:
            detail = json.loads(raw)["error"]["description"]
        except (ValueError, KeyError, TypeError):
            detail = raw[:300]
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Payment provider error: {detail}")


def _hmac(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def grant_pass(session: Session, user: User, payment: dict, order: dict) -> None:
    """Extend Pro for a paid one-time order. Safe to call more than once per payment."""
    notes = order.get("notes") or {}
    interval = notes.get("interval")
    if interval not in PERIOD_DAYS or str(notes.get("user_id")) != str(user.id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Order doesn't belong to this account")
    if payment.get("order_id") != order.get("id") or payment.get("amount") != order.get("amount"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payment doesn't match the order")
    if payment.get("status") not in ("captured", "authorized"):
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Payment hasn't gone through yet")
    if session.exec(select(Payment.id).where(Payment.provider_payment_id == payment["id"])).first():
        return  # already granted

    if payment["status"] == "authorized":
        # Accounts set to manual capture: capture now so the money actually settles.
        try:
            _razorpay("POST", f"/payments/{payment['id']}/capture", {"amount": payment["amount"], "currency": payment["currency"]})
        except HTTPException:
            # A concurrent confirmation may have captured it first; only fail if it really isn't captured.
            if _razorpay("GET", f"/payments/{payment['id']}").get("status") != "captured":
                raise

    # Paying again while still Pro extends from the current end date, not from today.
    start = max(utcnow(), user.plan_renews_at) if is_pro(user) and user.plan_renews_at else utcnow()
    user.plan = "pro"
    user.plan_interval = interval
    user.plan_renews_at = start + timedelta(days=PERIOD_DAYS[interval])
    session.add(user)
    session.add(
        Payment(
            user_id=user.id,
            provider_payment_id=payment["id"],
            provider_order_id=order["id"],
            amount=payment["amount"],
            currency=payment["currency"],
            interval=interval,
        )
    )
    try:
        session.commit()
    except IntegrityError:
        session.rollback()  # the webhook and the browser raced; the other one granted it
    session.refresh(user)


@router.get("/config")
def billing_config():
    mode = _mode()
    if mode == "subscription":
        available = [f"{c}_{i}" for (c, i), plan_id in config.RAZORPAY_PLANS.items() if plan_id]
    elif mode in ("one_time", "demo"):
        available = [f"{c}_{i}" for c in PRICES for i in PRICES[c]]
    else:
        available = []
    return {
        "provider": "razorpay" if mode in ("subscription", "one_time") else mode,
        "mode": mode,
        "prices": PRICES,
        "available": available,
    }


@router.post("/checkout")
def checkout(body: UpgradeIn, user: User = Depends(current_user), session: Session = Depends(get_session)):
    mode = _mode()
    # Passes can be bought again to extend; subscriptions and demo can't stack.
    if is_pro(user) and mode != "one_time":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You're already on Pro")

    if mode == "subscription":
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
            "mode": "subscription",
            "key_id": config.RAZORPAY_KEY_ID,
            "subscription_id": sub["id"],
            "email": user.email,
            "name": user.name,
        }

    if mode == "one_time":
        amount = PRICES[body.currency][body.interval] * 100  # paise / cents
        order = _razorpay(
            "POST",
            "/orders",
            {
                "amount": amount,
                "currency": body.currency,
                "receipt": f"u{user.id}-{int(utcnow().timestamp())}",
                "notes": {"user_id": str(user.id), "interval": body.interval, "kind": "pro_pass"},
            },
        )
        return {
            "provider": "razorpay",
            "mode": "one_time",
            "key_id": config.RAZORPAY_KEY_ID,
            "order_id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"],
            "email": user.email,
            "name": user.name,
        }

    if mode == "demo":
        renews = utcnow() + timedelta(days=PERIOD_DAYS[body.interval])
        set_plan(session, user, "pro", body.interval, renews)
        return {"provider": "demo", "mode": "demo", "user": user_out(user)}

    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Payments are launching soon.")


class VerifyIn(BaseModel):
    razorpay_payment_id: str
    razorpay_signature: str
    razorpay_subscription_id: Optional[str] = None
    razorpay_order_id: Optional[str] = None


@router.post("/verify", response_model=UserOut)
def verify(body: VerifyIn, user: User = Depends(current_user), session: Session = Depends(get_session)):
    """Called by the browser after Razorpay Checkout succeeds."""
    if not config.RAZORPAY_ENABLED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payments aren't configured")

    if body.razorpay_order_id:
        expected = _hmac(config.RAZORPAY_KEY_SECRET, f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode())
        if not hmac.compare_digest(expected, body.razorpay_signature):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payment signature mismatch")
        payment = _razorpay("GET", f"/payments/{body.razorpay_payment_id}")
        order = _razorpay("GET", f"/orders/{body.razorpay_order_id}")
        grant_pass(session, user, payment, order)
        return user_out(user)

    if not body.razorpay_subscription_id or body.razorpay_subscription_id != user.razorpay_subscription_id:
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
    renews = utc_from_ts(current_end) if current_end else utcnow() + timedelta(days=PERIOD_DAYS[interval])
    set_plan(session, user, "pro", interval, renews)
    return user_out(user)


@router.post("/webhook", include_in_schema=False)
async def webhook(request: Request, session: Session = Depends(get_session)):
    """Razorpay → Settings → Webhooks. Subscribe to order.paid and subscription.* events."""
    raw = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    if not config.RAZORPAY_WEBHOOK_SECRET or not hmac.compare_digest(
        _hmac(config.RAZORPAY_WEBHOOK_SECRET, raw), signature
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bad signature")

    event = json.loads(raw)
    name = event.get("event", "")
    payload = event.get("payload", {})

    if name == "order.paid":
        # Covers a buyer who paid but closed the tab before the browser callback ran.
        order = payload.get("order", {}).get("entity", {})
        payment = payload.get("payment", {}).get("entity", {})
        user_id = (order.get("notes") or {}).get("user_id")
        user = session.get(User, int(user_id)) if user_id and str(user_id).isdigit() else None
        if user and (order.get("notes") or {}).get("kind") == "pro_pass":
            try:
                grant_pass(session, user, payment, order)
            except HTTPException:
                pass  # ignore malformed or foreign events; always 200 so Razorpay stops retrying
        return {"ok": True}

    sub = payload.get("subscription", {}).get("entity", {})
    if not sub.get("id"):
        return {"ok": True}
    user = session.exec(select(User).where(User.razorpay_subscription_id == sub["id"])).first()
    if not user:
        return {"ok": True}

    interval = (sub.get("notes") or {}).get("interval", user.plan_interval or "monthly")
    current_end = utc_from_ts(sub["current_end"]) if sub.get("current_end") else None
    if name in ("subscription.activated", "subscription.charged", "subscription.resumed"):
        set_plan(session, user, "pro", interval, current_end)
    elif name == "subscription.cancelled":
        # Keep Pro until the paid period ends; is_pro() checks plan_renews_at.
        set_plan(session, user, "pro", interval, current_end or utcnow())
    elif name in ("subscription.halted", "subscription.completed", "subscription.paused"):
        set_plan(session, user, "free", None, None)
    return {"ok": True}


@router.post("/dev-reset", response_model=UserOut, include_in_schema=False)
def dev_reset(request: Request, user: User = Depends(current_user), session: Session = Depends(get_session)):
    """Local development only: put the current account back on Free so checkout can be
    tested again. Payment records are kept. Never available on Vercel."""
    if not is_local_dev(request):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    user.razorpay_subscription_id = None
    set_plan(session, user, "free", None, None)
    return user_out(user)


@router.post("/cancel", response_model=UserOut)
def cancel(user: User = Depends(current_user), session: Session = Depends(get_session)):
    if config.RAZORPAY_ENABLED and user.razorpay_subscription_id:
        _razorpay("POST", f"/subscriptions/{user.razorpay_subscription_id}/cancel", {"cancel_at_cycle_end": 1})
        # Access continues until plan_renews_at; the webhook confirms.
        return user_out(user)
    if config.RAZORPAY_ENABLED:
        # A one-time pass doesn't renew, so there's nothing to cancel; it simply ends.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your Pro pass doesn't renew, so there's nothing to cancel.")
    set_plan(session, user, "free", None, None)
    return user_out(user)
