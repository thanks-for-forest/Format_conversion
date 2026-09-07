"""邮件发送：未配置 SMTP_HOST 时开发假发送（验证码进日志），配置后走真实 SMTP。

端口 465 走 SSL 直连（163/阿里云推荐），其余端口 STARTTLS。
"""

import logging
import smtplib
from email.mime.text import MIMEText

from app.core import config

logger = logging.getLogger(__name__)


def send_code_email(email: str, code: str) -> None:
    """发送验证码邮件；未配置 SMTP_HOST 时降级为日志假发送。"""
    if not config.SMTP_HOST:
        logger.info("[dev-mailer] SMTP 未配置，验证码 → %s：code=%s", email, code)
        return
    minutes = config.CODE_TTL_SEC // 60
    msg = MIMEText(f"您的验证码是：{code}，{minutes} 分钟内有效。", "plain", "utf-8")
    msg["Subject"] = "文件格式转换 - 登录验证码"
    msg["From"] = config.MAIL_FROM or config.SMTP_USER
    msg["To"] = email
    if config.SMTP_PORT == 465:
        server: smtplib.SMTP = smtplib.SMTP_SSL(
            config.SMTP_HOST, config.SMTP_PORT, timeout=10
        )
    else:
        server = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=10)
        server.starttls()
    with server:
        if config.SMTP_USER:
            server.login(config.SMTP_USER, config.SMTP_PASSWORD)
        server.sendmail(msg["From"], [email], msg.as_string())
