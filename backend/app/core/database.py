"""数据库连接：惰性单例引擎 + 会话工厂（SQLite WAL）。"""

from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core import config

_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def _build_engine() -> Engine:
    """构建 SQLite 引擎：多线程安全 + WAL + busy_timeout。"""
    engine = create_engine(
        config.DATABASE_URL,
        connect_args={"check_same_thread": False, "timeout": 30},
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection: Any, _record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()

    return engine


def get_engine() -> Engine:
    """返回进程级单例引擎（首次调用时惰性创建）。"""
    global _engine
    if _engine is None:
        _engine = _build_engine()
    return _engine


def get_session() -> Session:
    """返回一个新会话；调用方负责提交与关闭。"""
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(
            bind=get_engine(), autoflush=False, expire_on_commit=False
        )
    return _session_factory()


def reset_database() -> None:
    """释放引擎与会话工厂缓存（供测试隔离使用）。"""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None
