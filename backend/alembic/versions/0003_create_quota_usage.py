"""create quota_usage table

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-07
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "quota_usage",
        # SQLite 仅 INTEGER PRIMARY KEY 作 rowid 别名可自增，故用 variant
        sa.Column(
            "id",
            sa.BigInteger().with_variant(sa.Integer(), "sqlite"),
            autoincrement=True,
            primary_key=True,
        ),
        sa.Column("user_id", sa.String(32), nullable=False),
        sa.Column("usage_date", sa.Date(), nullable=False),
        sa.Column(
            "conversion_count", sa.BigInteger(), nullable=False, server_default="0"
        ),
        sa.Column("traffic_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.UniqueConstraint("user_id", "usage_date", name="uq_quota_user_date"),
    )
    op.create_index("ix_quota_usage_user_id", "quota_usage", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_quota_usage_user_id", table_name="quota_usage")
    op.drop_table("quota_usage")
