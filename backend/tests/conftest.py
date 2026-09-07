"""测试隔离：临时 SQLite/Redis DB 与临时文件目录，避免污染开发数据。

必须先注入环境变量再导入 app（config 于导入期读取，导入后再设会失效），
随后会话级建库建表。Redis 使用独立 DB（/1）并在会话级清空。
"""

import os
import tempfile
from pathlib import Path

import pytest

_TMP_ROOT = Path(tempfile.mkdtemp(prefix="fc-test-"))
os.environ["CELERY_TASK_ALWAYS_EAGER"] = "1"
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_ROOT / 'test.db'}"
os.environ["TMP_DIR"] = str(_TMP_ROOT / "tmp")
# 测试永远假发送：清空 SMTP_HOST（先于 app 导入设置，load_dotenv 不会覆盖已有环境变量）
os.environ["SMTP_HOST"] = ""
# 测试专用 Redis DB（/1），避免清空开发数据；转发不稳时可设 TEST_REDIS_URL 指向 WSL IP
os.environ["REDIS_URL"] = os.getenv("TEST_REDIS_URL", "redis://localhost:6379/1")
# 配额基线放开（切片 5b）：转换类测试不撞每日额度，配额专项用例再 monkeypatch 收窄
os.environ["ANON_DAILY_COUNT"] = "1000000"
os.environ["ANON_DAILY_TRAFFIC_BYTES"] = str(10**12)
os.environ["USER_DAILY_COUNT"] = "1000000"
os.environ["USER_DAILY_TRAFFIC_BYTES"] = str(10**13)

from app.core.database import get_engine, reset_database  # noqa: E402
from app.models import Base  # noqa: E402
from app.services import code_store  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _prepare_database():
    """会话级：建库建表一次，收尾释放引擎。"""
    reset_database()
    code_store.reset_client()
    Base.metadata.create_all(get_engine())
    code_store.get_client().flushdb()
    yield
    reset_database()
    code_store.reset_client()


@pytest.fixture(autouse=True)
def _flush_redis():
    """每个用例前清空测试 Redis DB，保证限流/验证码用例互不干扰。"""
    code_store.get_client().flushdb()
    yield
    code_store.get_client().flushdb()
