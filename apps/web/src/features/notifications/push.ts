import { getVapidPublicKey, subscribePush, unsubscribePush } from "../../lib/api";

/** VAPID applicationServerKey 변환 (base64url → Uint8Array) */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const padded = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  const rawLength = raw.length;
  const bytes = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

/** 푸시 알림 활성화 시도 */
export async function enablePush(): Promise<"granted" | "denied" | "unsupported"> {
  try {
    // 서비스워커 & PushManager 지원 확인
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.warn("푸시 알림: 브라우저 미지원");
      return "unsupported";
    }

    // 알림 권한 요청
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn(`푸시 알림: 권한 거부 (${permission})`);
      return "denied";
    }

    // 서비스워커 등록 확인
    const registration = await navigator.serviceWorker.ready;

    // VAPID 공개키 조회
    const publicKey = await getVapidPublicKey();
    if (!publicKey) {
      console.warn("푸시 알림: VAPID 키 미설정");
      return "unsupported";
    }

    // 현재 구독 확인
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      // 새 구독 생성
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    // 백엔드에 등록
    await subscribePush(subscription.toJSON());

    return "granted";
  } catch (error) {
    console.error("푸시 활성화 실패:", error);
    return "denied";
  }
}

/** 푸시 알림 비활성화 */
export async function disablePush(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // 백엔드에서 구독 제거
      await unsubscribePush(subscription.endpoint);
      // 브라우저에서도 제거
      await subscription.unsubscribe();
    }
  } catch (error) {
    console.error("푸시 비활성화 실패:", error);
  }
}
