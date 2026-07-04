import { useState, useEffect } from "react";
import { enablePush } from "./push";

export function NotificationBanner() {
  const [dismissed, setDismissed] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [needsIOSGuide, setNeedsIOSGuide] = useState(false);

  useEffect(() => {
    // 브라우저 정보 확인
    const ua = navigator.userAgent.toLowerCase();
    const isIOSBrowser = /iphone|ipad|ipod/.test(ua);
    const isStandaloneMode =
      (window.navigator as unknown as Record<string, unknown>).standalone ===
      true;

    // iOS이고 standalone이 아니면 가이드 필요
    if (isIOSBrowser && !isStandaloneMode) {
      setNeedsIOSGuide(true);
    }

    // 알림 권한 및 배너 표시 여부 결정
    if (Notification.permission === "granted") {
      setDismissed(true); // 이미 권한 있으면 배너 숨김
    } else if (Notification.permission === "denied") {
      setDismissed(true); // 거부됨 → 배너 숨김
    } else {
      // default 상태: localStorage에서 dismissed 확인
      const wasDismissed = localStorage.getItem(
        "fridgy_notif_banner_dismissed"
      );
      setDismissed(wasDismissed === "true");
    }
  }, []);

  const handleEnablePush = async () => {
    setIsLoading(true);
    try {
      const result = await enablePush();
      if (result === "granted") {
        setDismissed(true);
        localStorage.setItem("fridgy_notif_banner_dismissed", "true");
      } else if (result === "denied") {
        alert("알림 권한이 거부되었습니다. 설정에서 권한을 변경해주세요.");
        setDismissed(true);
        localStorage.setItem("fridgy_notif_banner_dismissed", "true");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("fridgy_notif_banner_dismissed", "true");
  };

  if (dismissed) {
    return null;
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          {needsIOSGuide ? (
            <>
              <p className="font-medium">iOS에서 알림 받기</p>
              <p className="mt-1 text-xs text-blue-800">
                먼저 <span className="font-semibold">공유 아이콘(↑)</span>
                을 눌러
                <span className="font-semibold">홈 화면에 추가</span>
                를 선택한 후, 앱에서 알림을 활성화해주세요.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">임박 알림 받기</p>
              <p className="mt-1 text-xs text-blue-800">
                유통기한이 임박한 식재료를 미리 알려드립니다.
              </p>
            </>
          )}
        </div>
        {!needsIOSGuide && (
          <button
            onClick={handleEnablePush}
            disabled={isLoading}
            className="whitespace-nowrap rounded-md bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? "설정 중…" : "활성화"}
          </button>
        )}
        <button
          onClick={handleDismiss}
          className="shrink-0 text-lg text-blue-600 hover:text-blue-700"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
