import json
import os

os.environ["NEXTSTEP_IGNORE_DOTENV"] = "1"  # never use the developer's real keys in tests
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["DEMO_BILLING"] = "1"

from fastapi.testclient import TestClient  # noqa: E402

from api.index import app  # noqa: E402

client = TestClient(app)
DAY = "2026-10-13"


def auth(email="a@b.co"):
    r = client.post("/api/auth/signup", json={"email": email, "password": "password123", "name": "A"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_core_flow():
    h = auth()
    ids = [client.post("/api/tasks", json={"title": f"T{i}"}, headers=h).json()["id"] for i in range(4)]
    today = client.put("/api/today/priorities", json={"date": DAY, "task_ids": ids[:3]}, headers=h).json()
    assert [t["id"] for t in today["priorities"]] == ids[:3]
    assert today["next"]["id"] == ids[0]

    client.post(f"/api/tasks/{ids[0]}/skip", json={"date": DAY}, headers=h)
    assert client.get(f"/api/today?date={DAY}", headers=h).json()["next"]["id"] == ids[1]

    client.post("/api/focus", json={"task_id": ids[1], "date": DAY, "seconds": 1500}, headers=h)
    client.post(f"/api/tasks/{ids[1]}/complete", json={"date": DAY}, headers=h)
    t = client.get(f"/api/today?date={DAY}", headers=h).json()
    assert t["next"]["id"] == ids[2]
    assert t["pomodoros_today"] == 1 and t["focus_seconds_today"] == 1500
    assert len(t["done_today"]) == 1

    r = client.put(f"/api/reviews/{DAY}", json={"mood": 4, "wins": "shipped"}, headers=h)
    assert r.status_code == 200
    assert client.get(f"/api/today?date={DAY}", headers=h).json()["has_review"]


def test_pro_gating_and_routines():
    h = auth("pro@b.co")
    assert client.get(f"/api/insights/weekly?end={DAY}", headers=h).status_code == 402
    assert client.post("/api/tasks", json={"title": "Gym", "recurrence": "daily"}, headers=h).status_code == 402

    r = client.post("/api/billing/checkout", json={"interval": "yearly", "currency": "USD"}, headers=h)
    assert r.json()["user"]["is_pro"]

    r = client.post("/api/tasks", json={"title": "Gym", "recurrence": "daily", "date": DAY}, headers=h)
    assert r.status_code == 201
    client.get(f"/api/today?date={DAY}", headers=h)  # idempotent materialize
    inbox = client.get("/api/tasks", headers=h).json()
    assert [t["title"] for t in inbox] == ["Gym"]

    w = client.get(f"/api/insights/weekly?end={DAY}", headers=h).json()
    assert len(w["days"]) == 7


def test_auth_errors():
    auth("dup@b.co")
    r = client.post("/api/auth/signup", json={"email": "dup@b.co", "password": "password123"})
    assert r.status_code == 409
    assert client.post("/api/auth/login", json={"email": "dup@b.co", "password": "nope"}).status_code == 401
    assert client.get("/api/me").status_code == 401


def test_extras_beyond_three():
    h = auth("extra@b.co")
    ids = [client.post("/api/tasks", json={"title": f"T{i}"}, headers=h).json()["id"] for i in range(5)]
    t = client.put("/api/today/priorities", json={"date": DAY, "task_ids": ids}, headers=h).json()
    assert [x["id"] for x in t["priorities"]] == ids

    # Skipping a priority keeps it ahead of the extras.
    client.post(f"/api/tasks/{ids[0]}/skip", json={"date": DAY}, headers=h)
    order = [x["id"] for x in client.get(f"/api/today?date={DAY}", headers=h).json()["priorities"]]
    assert order == [ids[1], ids[2], ids[0], ids[3], ids[4]]

    # Skipping an extra sends it to the end.
    client.post(f"/api/tasks/{ids[3]}/skip", json={"date": DAY}, headers=h)
    order = [x["id"] for x in client.get(f"/api/today?date={DAY}", headers=h).json()["priorities"]]
    assert order[-1] == ids[3]

    too_many = [client.post("/api/tasks", json={"title": f"X{i}"}, headers=h).json()["id"] for i in range(11)]
    assert client.put("/api/today/priorities", json={"date": DAY, "task_ids": too_many}, headers=h).status_code == 422


def test_google_login(monkeypatch):
    from _lib import config
    from _lib.routes import auth as auth_routes

    monkeypatch.setattr(config, "GOOGLE_CLIENT_ID", "cid")
    claims = {"sub": "g-123", "email": "Goo@b.co", "email_verified": "true", "given_name": "Goo", "aud": "cid", "iss": "accounts.google.com"}
    monkeypatch.setattr(auth_routes, "verify_google_token", lambda _: claims)

    first = client.post("/api/auth/google", json={"credential": "x"}).json()
    again = client.post("/api/auth/google", json={"credential": "x"}).json()
    assert first["user"]["id"] == again["user"]["id"]
    assert first["user"]["email"] == "goo@b.co"
    # Google-only accounts can't be logged into with a password.
    r = client.post("/api/auth/login", json={"email": "goo@b.co", "password": ""})
    assert r.status_code == 401

    # An existing email/password account gets linked rather than duplicated.
    h = auth("link@b.co")
    me = client.get("/api/me", headers=h).json()
    claims.update(sub="g-456", email="link@b.co")
    linked = client.post("/api/auth/google", json={"credential": "x"}).json()
    assert linked["user"]["id"] == me["id"]


def test_size_priority_and_suggestions():
    h = auth("plan@b.co")

    def mk(title, importance=None, size=None):
        return client.post("/api/tasks", json={"title": title, "importance": importance, "size": size}, headers=h).json()

    low = mk("low", 1, "XS")
    big5 = mk("big5", 5, "XL")
    big4 = mk("big4", 4, "L")
    quick5 = mk("quick5", 5, "S")
    mid = mk("mid", 3, "M")
    assert quick5["importance"] == 5 and quick5["size"] == "S"

    s = client.get(f"/api/today/suggest?date={DAY}", headers=h).json()
    assert s["slots"] == 3
    titles = [x["task"]["title"] for x in s["suggestions"]]
    # Highest priority first, smaller wins ties, and only one L/XL gets in.
    assert titles == ["quick5", "big5", "mid"]
    assert "Priority 5" in s["suggestions"][0]["reason"]
    # Alternates are the rest, best first, for swapping a pick.
    assert [x["task"]["title"] for x in s["alternates"]] == ["big4", "low"]

    # Accept one; only the remaining spots are proposed, and it isn't proposed again.
    client.put("/api/today/priorities", json={"date": DAY, "task_ids": [quick5["id"]]}, headers=h)
    s = client.get(f"/api/today/suggest?date={DAY}", headers=h).json()
    assert s["slots"] == 2 and "quick5" not in [x["task"]["title"] for x in s["suggestions"]]

    # PATCH can set and clear the fields.
    r = client.patch(f"/api/tasks/{low['id']}", json={"importance": 4}, headers=h).json()
    assert r["importance"] == 4 and r["size"] == "XS"
    r = client.patch(f"/api/tasks/{low['id']}", json={"size": None}, headers=h).json()
    assert r["size"] is None and r["importance"] == 4
    assert client.post("/api/tasks", json={"title": "x", "size": "XXL"}, headers=h).status_code == 422
    assert big4  # unused beyond ranking


def test_dev_login_only_locally(monkeypatch):
    from _lib import config

    local = TestClient(app, base_url="http://localhost:5173", client=("127.0.0.1", 5000))
    r = local.post("/api/auth/dev-login")
    assert r.status_code == 200 and r.json()["user"]["email"] == "dev@localhost"
    assert local.post("/api/auth/dev-login").json()["user"]["id"] == r.json()["user"]["id"]

    monkeypatch.setattr(config, "DEV_LOGIN", False)  # what any Vercel deployment gets
    assert local.post("/api/auth/dev-login").status_code == 404
    assert client.get("/api/auth/config").json()["dev_login"] is False

    monkeypatch.setattr(config, "DEV_LOGIN", True)
    remote = TestClient(app, base_url="http://localhost:5173", client=("203.0.113.9", 5000))
    assert remote.post("/api/auth/dev-login").status_code == 404
    tunnel = TestClient(app, base_url="https://abc.ngrok.app", client=("127.0.0.1", 5000)).post("/api/auth/dev-login")
    # The local-only "reset to Free" follows the same rules.
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    assert local.post("/api/billing/dev-reset", headers=h).json()["plan"] == "free"
    assert remote.post("/api/billing/dev-reset", headers=h).status_code == 404
    assert tunnel.status_code == 404


def test_concurrent_cold_start(tmp_path):
    """First requests arriving together must not race on CREATE TABLE."""
    import threading

    from sqlmodel import create_engine

    from _lib import db

    original_engine, original_ready = db.engine, db._tables_ready
    db.engine = create_engine(f"sqlite:///{tmp_path}/cold.db", connect_args={"check_same_thread": False})
    db._tables_ready = False
    errors = []

    def first_request():
        try:
            next(db.get_session()).close()
        except Exception as e:  # noqa: BLE001
            errors.append(e)

    try:
        threads = [threading.Thread(target=first_request) for _ in range(8)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        assert not errors
    finally:
        db.engine, db._tables_ready = original_engine, original_ready


def test_one_time_pass(monkeypatch):
    """Keys but no plan IDs → Pro is sold as a one-time pass via Razorpay Orders."""
    import hashlib
    import hmac as _hmac

    from _lib import config
    from _lib.routes import billing

    monkeypatch.setattr(config, "RAZORPAY_ENABLED", True)
    monkeypatch.setattr(config, "RAZORPAY_SUBSCRIPTIONS", False)
    monkeypatch.setattr(config, "RAZORPAY_KEY_ID", "rzp_test_x")
    monkeypatch.setattr(config, "RAZORPAY_KEY_SECRET", "secret")
    monkeypatch.setattr(config, "RAZORPAY_WEBHOOK_SECRET", "whsec")

    orders, payments, calls = {}, {}, []

    def fake(method, path, payload=None):
        calls.append((method, path))
        if method == "POST" and path == "/orders":
            oid = f"order_{len(orders) + 1}"
            orders[oid] = {"id": oid, "amount": payload["amount"], "currency": payload["currency"], "notes": payload["notes"]}
            return orders[oid]
        if path.startswith("/orders/"):
            return orders[path.split("/")[-1]]
        if path.endswith("/capture"):
            payments[path.split("/")[2]]["status"] = "captured"
            return payments[path.split("/")[2]]
        if path.startswith("/payments/"):
            return payments[path.split("/")[-1]]
        raise AssertionError(path)

    monkeypatch.setattr(billing, "_razorpay", fake)
    h = auth("pass@b.co")
    cfg = client.get("/api/billing/config").json()
    assert cfg["mode"] == "one_time" and "INR_monthly" in cfg["available"]

    co = client.post("/api/billing/checkout", json={"interval": "monthly", "currency": "INR"}, headers=h).json()
    assert co["mode"] == "one_time" and co["amount"] == 29900 and co["currency"] == "INR"
    oid = co["order_id"]
    payments["pay_1"] = {"id": "pay_1", "order_id": oid, "amount": 29900, "currency": "INR", "status": "authorized"}

    def sig(order_id, payment_id):
        return _hmac.new(b"secret", f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()

    bad = client.post("/api/billing/verify", json={"razorpay_order_id": oid, "razorpay_payment_id": "pay_1", "razorpay_signature": "nope"}, headers=h)
    assert bad.status_code == 400

    body = {"razorpay_order_id": oid, "razorpay_payment_id": "pay_1", "razorpay_signature": sig(oid, "pay_1")}
    u = client.post("/api/billing/verify", json=body, headers=h).json()
    assert u["is_pro"] and not u["auto_renews"] and u["plan_interval"] == "monthly"
    assert ("POST", "/payments/pay_1/capture") in calls  # manual-capture accounts get captured
    first_end = u["plan_renews_at"]

    # Replaying the same payment (browser retry or webhook) doesn't extend twice.
    again = client.post("/api/billing/verify", json=body, headers=h).json()
    assert again["plan_renews_at"] == first_end
    event = json.dumps({"event": "order.paid", "payload": {"order": {"entity": orders[oid]}, "payment": {"entity": payments["pay_1"]}}}).encode()
    whsig = _hmac.new(b"whsec", event, hashlib.sha256).hexdigest()
    assert client.post("/api/billing/webhook", content=event, headers={"X-Razorpay-Signature": whsig}).status_code == 200
    assert client.get("/api/me", headers=h).json()["plan_renews_at"] == first_end

    # A second pass while still Pro extends from the current end date.
    co2 = client.post("/api/billing/checkout", json={"interval": "yearly", "currency": "INR"}, headers=h).json()
    payments["pay_2"] = {"id": "pay_2", "order_id": co2["order_id"], "amount": 178800, "currency": "INR", "status": "captured"}
    u2 = client.post("/api/billing/verify", json={"razorpay_order_id": co2["order_id"], "razorpay_payment_id": "pay_2", "razorpay_signature": sig(co2["order_id"], "pay_2")}, headers=h).json()
    from datetime import datetime as _dt
    gap = _dt.fromisoformat(u2["plan_renews_at"]) - _dt.fromisoformat(first_end)
    assert gap.days == 366

    # Someone else's order can't be redeemed on this account.
    other = auth("other@b.co")
    stolen = client.post("/api/billing/verify", json=body | {"razorpay_payment_id": "pay_1"}, headers=other)
    assert stolen.status_code == 400

    # Webhook path alone (buyer closed the tab) also grants the pass.
    h3 = auth("closedtab@b.co")
    co3 = client.post("/api/billing/checkout", json={"interval": "monthly", "currency": "USD"}, headers=h3).json()
    assert co3["amount"] == 500 and co3["currency"] == "USD"
    payments["pay_3"] = {"id": "pay_3", "order_id": co3["order_id"], "amount": 500, "currency": "USD", "status": "captured"}
    ev = json.dumps({"event": "order.paid", "payload": {"order": {"entity": orders[co3["order_id"]]}, "payment": {"entity": payments["pay_3"]}}}).encode()
    client.post("/api/billing/webhook", content=ev, headers={"X-Razorpay-Signature": _hmac.new(b"whsec", ev, hashlib.sha256).hexdigest()})
    assert client.get("/api/me", headers=h3).json()["is_pro"]

    assert client.post("/api/billing/cancel", json={}, headers=h).status_code == 400  # passes don't renew
