import threading
from typing import Iterator

from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from . import config


def _normalize(url: str) -> str:
    # Neon/Vercel hand out postgres:// URLs; SQLAlchemy needs an explicit driver.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def _make_engine():
    url = _normalize(config.DATABASE_URL)
    if url.startswith("sqlite"):
        kwargs = {"connect_args": {"check_same_thread": False}}
        if url in ("sqlite://", "sqlite:///:memory:"):
            kwargs["poolclass"] = StaticPool
        return create_engine(url, **kwargs)
    return create_engine(
        url,
        pool_size=config.DB_POOL_SIZE,
        max_overflow=config.DB_MAX_OVERFLOW,
        pool_pre_ping=True,
        pool_recycle=300,
        # Neon's pooled endpoint runs PgBouncer in transaction mode, which
        # doesn't support server-side prepared statements.
        connect_args={"prepare_threshold": None},
    )


engine = _make_engine()
_tables_ready = False
_tables_lock = threading.Lock()


def create_tables() -> None:
    from . import models  # noqa: F401  (register tables)

    try:
        SQLModel.metadata.create_all(engine)
    except (OperationalError, ProgrammingError, IntegrityError):
        # Another instance created the tables between our existence check and
        # CREATE TABLE. Running again sees them and does nothing.
        SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    # Lazily ensure the schema once per serverless instance (i.e. per cold start).
    # Done here rather than in a lifespan hook so it works on any ASGI host. The lock
    # stops concurrent first requests in one instance from racing each other.
    global _tables_ready
    if not _tables_ready and config.AUTO_MIGRATE:
        with _tables_lock:
            if not _tables_ready:
                create_tables()
                _tables_ready = True
    with Session(engine) as session:
        yield session
