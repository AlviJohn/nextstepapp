import json
import urllib.error
import urllib.parse
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select

from .. import config
from ..db import get_session
from ..models import User
from ..schemas import AuthOut, GoogleIn, LoginIn, SignupIn, UserOut
from ..security import create_token, current_user, hash_password, is_pro, verify_password

router = APIRouter(prefix="/api", tags=["auth"])


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        plan=user.plan,
        plan_interval=user.plan_interval,
        plan_renews_at=user.plan_renews_at,
        is_pro=is_pro(user),
        auto_renews=bool(user.razorpay_subscription_id) and is_pro(user),
    )


@router.post("/auth/signup", response_model=AuthOut, status_code=201)
def signup(body: SignupIn, session: Session = Depends(get_session)):
    if session.exec(select(User.id).where(User.email == body.email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(email=body.email, name=body.name.strip(), password_hash=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return AuthOut(token=create_token(user.id), user=user_out(user))


@router.post("/auth/login", response_model=AuthOut)
def login(body: LoginIn, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == body.email.strip().lower())).first()
    if user and not user.password_hash:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This account uses Google sign-in")
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    return AuthOut(token=create_token(user.id), user=user_out(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user_out(user)


@router.get("/auth/config")
def auth_config():
    return {"google_client_id": config.GOOGLE_CLIENT_ID or None, "dev_login": config.DEV_LOGIN}


_LOOPBACK = {"127.0.0.1", "::1", "localhost"}
DEV_EMAIL = "dev@localhost"


def is_local_dev(request: Request) -> bool:
    """True only for local development: not on Vercel, DEV_LOGIN not disabled, and the
    request comes from this machine to a localhost address. The Host check also blocks
    tunnels (ngrok etc.), which connect from loopback."""
    client_host = request.client.host if request.client else ""
    host = (request.headers.get("host") or "").rsplit(":", 1)[0].strip("[]")
    return config.DEV_LOGIN and client_host in _LOOPBACK and host in _LOOPBACK


@router.post("/auth/dev-login", response_model=AuthOut, include_in_schema=False)
def dev_login(request: Request, session: Session = Depends(get_session)):
    """Signs in as a local dev user without a password (local development only)."""
    if not is_local_dev(request):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    user = session.exec(select(User).where(User.email == DEV_EMAIL)).first()
    if not user:
        user = User(email=DEV_EMAIL, name="Dev")
        session.add(user)
        session.commit()
        session.refresh(user)
    return AuthOut(token=create_token(user.id), user=user_out(user))


def verify_google_token(credential: str) -> dict:
    """Validate a Google ID token via Google's tokeninfo endpoint (checks signature
    and expiry), then check it was issued for this app. Only runs at sign-in, so
    the extra network hop is fine and avoids pulling in google-auth + crypto deps."""
    url = "https://oauth2.googleapis.com/tokeninfo?" + urllib.parse.urlencode({"id_token": credential})
    try:
        with urllib.request.urlopen(url, timeout=8) as resp:
            info = json.loads(resp.read())
    except urllib.error.HTTPError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google sign-in failed")
    if info.get("aud") != config.GOOGLE_CLIENT_ID:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google token was issued for another app")
    if info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unexpected token issuer")
    if str(info.get("email_verified")).lower() != "true" or not info.get("email"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google account email isn't verified")
    return info


@router.post("/auth/google", response_model=AuthOut)
def google_login(body: GoogleIn, session: Session = Depends(get_session)):
    if not config.GOOGLE_CLIENT_ID:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google sign-in isn't configured")
    info = verify_google_token(body.credential)
    sub, email = info["sub"], info["email"].strip().lower()

    user = session.exec(select(User).where(User.google_sub == sub)).first()
    if not user:
        # Same verified email → link to the existing account instead of duplicating it.
        user = session.exec(select(User).where(User.email == email)).first()
        if user:
            user.google_sub = sub
        else:
            user = User(email=email, name=(info.get("given_name") or "")[:120], google_sub=sub)
        session.add(user)
        session.commit()
        session.refresh(user)
    return AuthOut(token=create_token(user.id), user=user_out(user))
