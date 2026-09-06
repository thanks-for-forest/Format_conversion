"""SQLAlchemy 模型层：声明式基类与表模型。"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """所有 ORM 模型的声明式基类。"""
