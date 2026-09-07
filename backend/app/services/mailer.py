"""邮件发送：开发环境假发送（验证码进日志），生产走 SMTP（切片 5a）。"""

import logging
import smtplib
from email.mime.text import MIMEText

from app.core import config

logger = logging.getLogger(__name__)


def send_code_email(email: str, code: str) -> None:
    """发送验证码邮件；开发环境仅记录日志，不发起网络请求。"""
    if config.ENV != "production":
        logger.info("[dev-mailer] 验证码邮件 → %s：code=%s", email, code)
        return
    msg = MIMEText(
        f"您的验证码是：{code}，{config.CODE_TTL_SEC // 60} 分钟内有效。",
        "plain",
        "utf-8",
    )
    msg["Subject"] = "文件格式转换 - 登录验证码"
    msg["From"] = config.MAIL_FROM
    msg["To"] = email
    with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=10) as server:
        server.starttls()
        if config.SMTP_USER:
            server.login(config.SMTP_USER, config.SMTP_PASSWORD)
        server.sendmail(config.MAIL_FROM, [email], msg.as_string())
