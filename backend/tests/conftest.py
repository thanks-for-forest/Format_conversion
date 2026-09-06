"""测试隔离：临时 SQLite 与临时文件目录，避免污染开发数据。

必须先注入环境变量再导入 app（config 于导入期读取，导入后再设会失效），
随后会话级建库建表。
"""

import os
import tempfile
from pathlib import Path

import pytest

_TMP_ROOT = Path(tempfile.mkdtemp(prefix="fc-test-"))
os.environ["CELERY_TASK_ALWAYS_EAGER"] = "1"
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_ROOT / 'test.db'}"
os.environ["TMP_DIR"] = str(_TMP_ROOT / "tmp")

from app.core.database import get_engine, reset_database  # noqa: E402
from app.models import Base  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _prepare_database():
    """会话级：建库建表一次，收尾释放引擎。"""
    reset_database()
    Base.metadata.create_all(get_engine())
    yield
    reset_database()
