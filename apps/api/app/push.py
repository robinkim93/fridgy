"""Web Push(VAPID) 전송 래퍼.

pywebpush로 브라우저 푸시 서비스에 암호화 페이로드를 보낸다. 만료·해지된 구독
(404/410)은 호출 측이 정리할 수 있도록 endpoint를 담은 예외로 신호한다.
VAPID 키 미설정 시에는 전송을 건너뛰고(인앱 알림함은 그대로 동작) 로그만 남긴다.
"""

from __future__ import annotations

import json
import logging

from pywebpush import WebPushException, webpush

from .config import get_settings

logger = logging.getLogger(__name__)


class SubscriptionGone(Exception):
    """구독이 만료/해지됨(404·410). 호출 측이 해당 endpoint를 삭제해야 한다."""

    def __init__(self, endpoint: str):
        super().__init__(endpoint)
        self.endpoint = endpoint


def send_push(subscription: dict, payload: dict) -> bool:
    """단일 구독에 푸시 발송.

    subscription: { endpoint, keys: { p256dh, auth } }
    반환: 전송 성공 True / VAPID 미설정 등으로 건너뜀 False.
    구독 만료 시 SubscriptionGone 발생.
    """
    s = get_settings()
    if not s.vapid_private_key:
        logger.warning("VAPID_PRIVATE_KEY 미설정 — 푸시 전송 건너뜀")
        return False

    try:
        webpush(
            subscription_info=subscription,
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=s.vapid_private_key,
            vapid_claims={"sub": s.vapid_subject},
        )
        return True
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in (404, 410):
            raise SubscriptionGone(subscription["endpoint"]) from exc
        logger.warning("푸시 전송 실패(status=%s): %s", status, exc)
        return False
