// 푸시 알림 수신 핸들러
self.addEventListener("push", (event) => {
  try {
    // 푸시 데이터 파싱: { title, body, url, itemIds }
    const data = event.data.json();
    const { title, body, url, itemIds } = data;

    // 알림 표시
    event.waitUntil(
      self.registration.showNotification(title, {
        body: body || "알림이 도착했습니다.",
        icon: "/pwa-192.png",
        badge: "/pwa-192.png",
        data: { url: url || "/" },
        tag: "imminent-notification", // 같은 태그면 누적 안 함
      })
    );
  } catch (error) {
    console.error("[push-sw] 푸시 데이터 파싱 실패:", error);
    // 폴백: 기본 알림 표시
    event.waitUntil(
      self.registration.showNotification("Fridgy", {
        body: "알림이 도착했습니다.",
        icon: "/pwa-192.png",
        badge: "/pwa-192.png",
        data: { url: "/" },
      })
    );
  }
});

// 알림 클릭 핸들러
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      // 이미 열린 탭 중 /로 시작하는 경우 focus
      for (const client of clientList) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      // 없으면 새 탭/창 열기
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
