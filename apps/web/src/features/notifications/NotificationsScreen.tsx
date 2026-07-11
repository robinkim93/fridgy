import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification } from "@fridgy/shared";
import { getNotifications, markNotificationRead } from "../../lib/api";

/** ISO date → 상대 시간 (예: "2시간 전") */
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSeconds < 60) return "방금 전";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}분 전`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}시간 전`;
  if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}일 전`;
  return `${Math.floor(diffSeconds / 604800)}주 전`;
}

export function NotificationsScreen() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["notifications"],
    queryFn: getNotifications,
    retry: false,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const handleMarkRead = (notification: Notification) => {
    if (!notification.readAt) {
      markRead.mutate(notification.id);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-ink">알림</h1>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-brand" />
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-urgent/30 bg-urgent-tint p-3 text-sm text-[#B91C1C]">
          {(error as Error).message}
        </div>
      )}

      {data && data.items.length === 0 && (
        <div className="rounded-lg border border-line bg-muted p-8 text-center text-ink-faint">
          아직 알림이 없어요.
        </div>
      )}

      {data && data.items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.items.map((notification) => (
            <li
              key={notification.id}
              onClick={() => handleMarkRead(notification)}
              className={`press cursor-pointer rounded-lg border p-3 shadow-sm transition-colors ${
                notification.readAt
                  ? "border-line bg-surface"
                  : "border-brand-100 bg-brand-50"
              } hover:border-line-strong`}
            >
              <div className="flex items-start gap-3">
                {!notification.readAt && (
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink">{notification.title}</p>
                  <p className="mt-1 text-sm text-ink-soft">{notification.body}</p>
                  <p className="tnum mt-2 text-xs text-ink-faint">
                    {formatRelativeTime(notification.createdAt)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
