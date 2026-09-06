"""create conversion_tasks table

Revision ID: 0001
Revises:
Create Date: 2026-09-06
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "conversion_tasks",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("pass_key", sa.String(32), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("message", sa.String(255), nullable=False),
        sa.Column("source_name", sa.String(255), nullable=False),
        sa.Column("source_format", sa.String(16), nullable=False),
        sa.Column("target_format", sa.String(16), nullable=False),
        sa.Column("in_size", sa.BigInteger(), nullable=False),
        sa.Column("out_size", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("files_removed", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_conversion_tasks_pass_key", "conversion_tasks", ["pass_key"])
    op.create_index("ix_conversion_tasks_status", "conversion_tasks", ["status"])


def downgrade() -> None:
    op.drop_index("ix_conversion_tasks_status", table_name="conversion_tasks")
    op.drop_index("ix_conversion_tasks_pass_key", table_name="conversion_tasks")
    op.drop_table("conversion_tasks")
