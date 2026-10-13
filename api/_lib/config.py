import os
import warnings


def _load_dotenv() -> None:
    """Local dev convenience: read KEY=VALUE lines from the repo's .env. Vercel injects
    env vars itself, and real environment variables always win."""
    path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                if value.strip():
                    os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


IS_PRODUCTION = os.getenv("VERCEL_ENV") == "production"

# Neon / Vercel Postgres expose one of these. Falls back to a local SQLite file for dev.
DATABASE_URL = (
    os.getenv("DATABASE_URL")
    or os.getenv("POSTGRES_URL")
    or "sqlite:///./nextstep.db"
)

JWT_SECRET = os.getenv("JWT_SECRET", "")
if not JWT_SECRET:
    if os.getenv("VERCEL"):  # any Vercel deployment, preview included
        raise RuntimeError("JWT_SECRET must be set on Vercel")
    warnings.warn("JWT_SECRET not set; using an insecure local-dev secret")
    JWT_SECRET = "local-dev-only-not-secret"

# Google Sign-In: OAuth 2.0 Web client ID from Google Cloud Console.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

# Local dev only: skip sign-in on localhost. Can never be on in a Vercel deployment.
DEV_LOGIN = not os.getenv("VERCEL") and _bool("DEV_LOGIN", True)

JWT_TTL_DAYS = int(os.getenv("JWT_TTL_DAYS", "30"))

# Creates tables on cold start. Cheap (a few catalog queries), but you can turn it
# off (AUTO_MIGRATE=0) once the schema exists; use proper migrations from then on.
AUTO_MIGRATE = _bool("AUTO_MIGRATE", True)

# Small per-instance pool. With Vercel Fluid compute one instance serves many
# concurrent requests, so a pool beats NullPool; Neon's pooler handles fan-out.
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "5"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "5"))

# Razorpay Subscriptions. Create one plan per currency + interval in the Razorpay
# dashboard and paste the ids here. USD plans need International Payments enabled
# on your Razorpay account. Any plan left blank is simply not offered.
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
RAZORPAY_PLANS = {
    ("INR", "monthly"): os.getenv("RAZORPAY_PLAN_INR_MONTHLY", ""),
    ("INR", "yearly"): os.getenv("RAZORPAY_PLAN_INR_YEARLY", ""),
    ("USD", "monthly"): os.getenv("RAZORPAY_PLAN_USD_MONTHLY", ""),
    ("USD", "yearly"): os.getenv("RAZORPAY_PLAN_USD_YEARLY", ""),
}
RAZORPAY_ENABLED = bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET and any(RAZORPAY_PLANS.values()))

# Without Razorpay keys, lets users flip to Pro instantly so you can test gating.
# Never on in production.
DEMO_BILLING = not RAZORPAY_ENABLED and _bool("DEMO_BILLING", not IS_PRODUCTION)

FREE_OPEN_TASK_LIMIT = int(os.getenv("FREE_OPEN_TASK_LIMIT", "50"))
FREE_HISTORY_DAYS = 7
