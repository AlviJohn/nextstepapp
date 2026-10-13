# NextStep — one task, then the next

Pick three priorities. See only the next one. Focus with a Pomodoro timer. Close the day with a two-minute review.

- **Frontend:** React 19 + Vite + Tailwind v4 + Motion (`frontend/`)
- **Backend:** FastAPI + SQLModel, deployed as one Vercel Python function (`api/`)
- **Database:** Postgres on Neon (via the Vercel Marketplace); SQLite locally
- **Payments:** Razorpay Subscriptions in INR and USD (demo mode until keys are added)

## Run locally

```bash
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements-dev.txt
.venv/bin/uvicorn api.index:app --reload --port 8000      # API on :8000 (SQLite file nextstep.db)
cd frontend && npm install && npm run dev                 # app on :5173, proxies /api → :8000
.venv/bin/python -m pytest -q tests                       # API tests
```

Copy `.env.example` to `.env` to set keys locally. On `localhost` you're signed in automatically as a dev user, so there's no login while developing. Sign out to test the real login and signup for that tab. This is disabled on any Vercel deployment, and for requests that don't come from your own machine.

With no env vars set, the app uses SQLite, a random JWT secret, and **demo billing** (Upgrade flips you to Pro for free).

## How tasks are added and chosen

- **Quick add:** type a task and press Enter. `p1`–`p5` sets priority (5 = critical), `#xs` `#s` `#m` `#l` `#xl` sets size, e.g. `Send proposal p4 #s`. Pasting several lines adds one task per line. Press **N** anywhere to jump to the box.
- **Suggestions:** when today has open priority spots, NextStep proposes tasks automatically, ranked by priority, then smaller size, with a nudge for carried-over or long-waiting tasks and at most one L/XL. Each pick can be swapped for the next-best task or removed; nothing changes until you press "Use these". The logic is in `api/_lib/planner.py`.
- **Today's list:** the first three are the priorities. More can be added as bonus tasks, which only appear once the three are done.

## Deploy to Vercel

1. Push to GitHub and **Import** the repo in Vercel. `vercel.json` already sets the build. Leave the framework preset as "Other".
2. **Storage → Marketplace → Neon → Create** and connect it to the project. This sets `DATABASE_URL` automatically. Use the *pooled* connection string, which is the default.
3. **Settings → Environment Variables:** add `JWT_SECRET` (generate with `python -c "import secrets;print(secrets.token_urlsafe(48))"`).
4. Deploy. Tables are created on the first request.

### How it scales on Vercel

| Concern | What's in place |
|---|---|
| Stateless compute | JWT auth, no server sessions, so any instance can serve any request |
| DB connections | Neon's PgBouncer pooler + a small per-instance SQLAlchemy pool (`DB_POOL_SIZE`), `pool_pre_ping`, prepared statements off for PgBouncer |
| Fluid compute | One warm instance handles many concurrent requests, so the pool is reused instead of reconnecting per request |
| Query cost | Composite indexes on `(user_id, status)`, `(user_id, focus_date)`, `(user_id, done_date)`; reports use 3 range queries regardless of span |
| Round trips | The Focus screen loads with one `/api/today` call |
| Static assets | Served from Vercel's CDN with `immutable` cache headers; API responses are `no-store` |
| Cold starts | Small dependency set (no ORM extras or SDKs; Razorpay is called via stdlib) |
| Schema | Auto-created per cold start; set `AUTO_MIGRATE=0` and adopt Alembic once you start changing the schema |

Next steps at real scale: add rate limiting on `/api/auth/*` (Vercel Firewall rules), add Alembic migrations, and add a Neon read replica for reports if needed.

## Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), go to **Create credentials → OAuth client ID → Web application**. Set up the OAuth consent screen first if prompted (External; app name, support email).
2. **Authorized JavaScript origins:** add `http://localhost:5173` for local dev and `https://<your-domain>` (plus your `*.vercel.app` URL). No redirect URI is needed, because the app uses Google Identity Services and receives an ID token in the page.
3. Set `GOOGLE_CLIENT_ID` in Vercel, and in a local `.env` for dev. The Google button appears automatically once it's set.

The backend verifies the ID token with Google, checks it was issued for your client ID, and requires a verified email. If someone already has an email/password account with the same address, Google is linked to it instead of creating a duplicate.

## Payments (Razorpay, INR + USD)

The plan logic is in `api/_lib/routes/billing.py`. Every plan change goes through `set_plan()`.

1. Create a Razorpay account and complete KYC. To charge in **USD**, enable **International Payments** (Settings → Payment methods).
2. **Subscriptions → Plans:** create up to four plans and copy their IDs:
   - INR monthly ₹299 · INR yearly ₹1,788 (₹149/mo)
   - USD monthly $5 · USD yearly $36 ($3/mo)

   If you change prices, update `PRICES` in `billing.py` to match.
3. **Settings → API Keys:** generate a key. **Settings → Webhooks:** add `https://<your-domain>/api/billing/webhook` with a secret, and subscribe to `subscription.activated`, `subscription.charged`, `subscription.cancelled`, `subscription.halted`, `subscription.completed`, `subscription.paused`, and `subscription.resumed`.
4. Add these env vars in Vercel:
   ```
   RAZORPAY_KEY_ID  RAZORPAY_KEY_SECRET  RAZORPAY_WEBHOOK_SECRET
   RAZORPAY_PLAN_INR_MONTHLY  RAZORPAY_PLAN_INR_YEARLY
   RAZORPAY_PLAN_USD_MONTHLY  RAZORPAY_PLAN_USD_YEARLY
   ```
   Any plan left blank is shown as unavailable. Use test-mode keys first.

**Flow:** Upgrade → `POST /api/billing/checkout` creates a subscription → Razorpay Checkout opens (UPI, cards, netbanking; international cards for USD) → `POST /api/billing/verify` checks the signature and grants Pro → the webhook keeps renewals and cancellations in sync. Cancelling keeps Pro until the paid period ends.

*Alternative:* for a global USD audience, Stripe (or a merchant of record like Paddle/Lemon Squeezy, which also handles sales tax/VAT) can replace Razorpay by implementing the same `checkout`/`webhook` endpoints and calling `set_plan()`.

## Free vs Pro

| | Free | Pro |
|---|---|---|
| Three priorities, focus view, Pomodoro, daily review | ✓ | ✓ |
| History | 7 days | 90 days |
| Open tasks | 50 | Unlimited |
| Routines (daily / weekdays / weekly) | – | ✓ |
| Weekly report (output, focus, mood, streaks) | – | ✓ |

Limits are enforced on the server (`402 pro_required`), not just hidden in the UI.
