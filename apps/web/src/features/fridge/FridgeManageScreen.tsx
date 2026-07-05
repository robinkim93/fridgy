import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FridgeActivity, FridgeMember } from "@fridgy/shared";
import {
  renameFridge,
  createInvite,
  getMembers,
  removeMember,
  getActivity,
} from "../../lib/api";
import { useActiveFridge } from "./useActiveFridge";

interface FridgeManageScreenProps {
  onDashboardReturn: () => void;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getActivityLabel(
  action: string,
  detail: Record<string, unknown>
): string {
  const count = detail.count ? ` (${detail.count}건)` : "";
  switch (action) {
    case "added":
      return `재고 추가${count}`;
    case "consumed":
      return `소비${count}`;
    case "discarded":
      return `폐기${count}`;
    case "member_joined":
      return "멤버 참여";
    case "member_removed":
      return "멤버 제거";
    default:
      return action;
  }
}

export function FridgeManageScreen({
  onDashboardReturn,
}: FridgeManageScreenProps) {
  const queryClient = useQueryClient();
  const { activeFridge } = useActiveFridge();
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(activeFridge?.name ?? "");
  const [inviteUrl, setInviteUrl] = useState<string>("");
  const [inviteExpires, setInviteExpires] = useState<string>("");

  if (!activeFridge) {
    return null;
  }

  const isOwner = activeFridge.isOwner;

  // 멤버 목록
  const {
    data: members = [],
    isLoading: membersLoading,
    isError: membersError,
  } = useQuery({
    queryKey: ["fridges", activeFridge.id, "members"],
    queryFn: () => getMembers(activeFridge.id),
    retry: false,
  });

  // 변경 로그
  const {
    data: activities = [],
    isLoading: activitiesLoading,
    isError: activitiesError,
  } = useQuery({
    queryKey: ["fridges", activeFridge.id, "activity"],
    queryFn: () => getActivity(activeFridge.id),
    retry: false,
  });

  // 이름 변경 mutation
  const renameMutation = useMutation({
    mutationFn: (name: string) => renameFridge(activeFridge.id, name),
    onSuccess: () => {
      setIsEditingName(false);
      queryClient.invalidateQueries({ queryKey: ["fridges"] });
    },
  });

  // 초대 생성 mutation
  const inviteMutation = useMutation({
    mutationFn: () => createInvite(activeFridge.id, "member", 72),
    onSuccess: (data) => {
      const url = `${window.location.origin}/?invite=${data.token}`;
      setInviteUrl(url);
      setInviteExpires(data.expiresAt);
    },
  });

  // 멤버 제거 mutation
  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      removeMember(activeFridge.id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["fridges", activeFridge.id, "members"],
      });
      queryClient.invalidateQueries({
        queryKey: ["fridges", activeFridge.id, "activity"],
      });
    },
  });

  const handleRename = () => {
    if (newName.trim() && newName !== activeFridge.name) {
      renameMutation.mutate(newName.trim());
    } else {
      setIsEditingName(false);
      setNewName(activeFridge.name);
    }
  };

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(inviteUrl);
    window.alert("초대 링크가 복사되었습니다.");
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-green-700">냉장고 관리</h1>
        <button
          onClick={onDashboardReturn}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 대시보드
        </button>
      </div>

      {/* 냉장고 이름 섹션 (소유자만) */}
      {isOwner && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-700">냉장고 이름</h2>
          <div className="mt-2 flex items-center gap-2">
            {isEditingName ? (
              <>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  autoFocus
                />
                <button
                  onClick={handleRename}
                  disabled={renameMutation.isPending}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  저장
                </button>
                <button
                  onClick={() => {
                    setIsEditingName(false);
                    setNewName(activeFridge.name);
                  }}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  취소
                </button>
              </>
            ) : (
              <>
                <p className="flex-1 text-sm text-gray-800">
                  {activeFridge.name}
                </p>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  수정
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 초대 링크 섹션 (소유자만) */}
      {isOwner && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-700">멤버 초대</h2>
          {inviteUrl ? (
            <div className="mt-2 space-y-2">
              <div className="rounded-md bg-blue-50 p-3">
                <p className="break-all text-xs text-blue-800">{inviteUrl}</p>
              </div>
              <p className="text-xs text-gray-500">
                만료: {formatDate(inviteExpires)}
              </p>
              <button
                onClick={handleCopyInvite}
                className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                링크 복사
              </button>
              <button
                onClick={() => {
                  setInviteUrl("");
                  setInviteExpires("");
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                다른 링크 생성
              </button>
            </div>
          ) : (
            <button
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending}
              className="mt-2 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              초대 링크 생성
            </button>
          )}
        </div>
      )}

      {/* 멤버 목록 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-700">멤버</h2>
        {membersLoading && (
          <div className="mt-4 flex justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          </div>
        )}
        {membersError && (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            멤버 로드 실패
          </div>
        )}
        {members.length === 0 && !membersLoading && (
          <p className="mt-2 text-xs text-gray-500">멤버가 없습니다.</p>
        )}
        {members.length > 0 && (
          <ul className="mt-3 space-y-2">
            {members.map((member: FridgeMember) => (
              <li
                key={member.userId}
                className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 p-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-800">
                    {member.userId.substring(0, 8)}...
                  </p>
                  <p className="text-xs text-gray-500">
                    {member.role === "owner" ? "소유자" : "멤버"} ·{" "}
                    {formatDate(member.joinedAt)}
                  </p>
                </div>
                {isOwner && member.role !== "owner" && (
                  <button
                    onClick={() => removeMutation.mutate(member.userId)}
                    disabled={removeMutation.isPending}
                    className="ml-2 shrink-0 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:border-red-300 disabled:opacity-50"
                  >
                    내보내기
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 변경 로그 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-700">변경 로그</h2>
        {activitiesLoading && (
          <div className="mt-4 flex justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          </div>
        )}
        {activitiesError && (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            로그 로드 실패
          </div>
        )}
        {activities.length === 0 && !activitiesLoading && (
          <p className="mt-2 text-xs text-gray-500">변경 로그가 없습니다.</p>
        )}
        {activities.length > 0 && (
          <ul className="mt-3 space-y-2">
            {activities.map((activity: FridgeActivity) => (
              <li
                key={activity.id}
                className="flex items-start gap-2 rounded-md bg-gray-50 p-2 text-xs text-gray-700"
              >
                <span className="mt-0.5 shrink-0 rounded-full bg-gray-300 px-2 py-0.5">
                  {getActivityLabel(activity.action, activity.detail)}
                </span>
                <span className="text-gray-500">
                  {formatDate(activity.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
