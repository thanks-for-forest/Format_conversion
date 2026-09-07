"""配额路由：预检摘要与本地转换计次（切片 5b）。"""

from typing import Annotated

from fastapi import APIRouter, Cookie, Request

from app.api.deps import client_ip, current_user_id
from app.core.responses import ok
from app.services import quota

router = APIRouter(prefix="/api/quota", tags=["quota"])


@router.get("/summary")
def quota_summary(
    request: Request,
    access_token: Annotated[str | None, Cookie()] = None,
) -> dict[str, object]:
    """当前身份的配额摘要（前端预检用；未登录返回匿名档）。"""
    user_id = current_user_id(access_token)
    return ok(quota.summary(user_id, client_ip(request)))


@router.post("/local-count")
def local_count(
    request: Request,
    access_token: Annotated[str | None, Cookie()] = None,
) -> dict[str, object]:
    """本地转换成功上报 +1（不计流量）；次数超限 429。"""
    user_id = current_user_id(access_token)
    quota.consume_local(user_id, client_ip(request))
    return ok({"counted": True})
