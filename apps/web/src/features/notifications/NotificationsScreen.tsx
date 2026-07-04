import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification } from "@fridgy/shared";
import { getNotifications, markNotificationRead } from "../../lib/api";

interface NotificationsScreenProps {
  onDashboardReturn: () => void;
}

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

export function NotificationsScreen({
  onDashboardReturn,
}: NotificationsScreenProps) {
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
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-green-700">알림</h1>
        <button
          onClick={onDashboardReturn}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 대시보드
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(error as Error).message}
        </div>
      )}

      {data && data.items.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-gray-500">
          아직 알림이 없어요.
        </div>
      )}

      {data && data.items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.items.map((notification) => (
            <li
              key={notification.id}
              onClick={() => handleMarkRead(notification)}
              className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                notification.readAt
                  ? "border-gray-200 bg-white"
                  : "border-blue-200 bg-blue-50"
              } hover:border-gray-300`}
            >
              <div className="flex items-start gap-3">
                {!notification.readAt && (
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">
                    {notification.title}
                  </p>
                  <p className="mt-1 text-sm text-gray-700">
                    {notification.body}
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
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
