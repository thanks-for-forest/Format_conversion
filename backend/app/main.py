"""FastAPI 应用入口。"""

from fastapi import FastAPI

app = FastAPI(title="Format Conversion API")


@app.get("/health")
def health() -> dict[str, str]:
    """健康检查，供部署探针使用。"""
    return {"status": "ok"}
