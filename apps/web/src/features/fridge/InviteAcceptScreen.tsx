import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getInviteInfo, acceptInvite } from "../../lib/api";
import { useActiveFridge } from "./useActiveFridge";
import { useAuth } from "../auth/useAuth";

interface InviteAcceptScreenProps {
  token: string;
  onInviteAccepted: () => void;
}

export function InviteAcceptScreen({
  token,
  onInviteAccepted,
}: InviteAcceptScreenProps) {
  const { session } = useAuth();
  const { setActiveFridgeId, refetch: refetchFridges } = useActiveFridge();
  const [errorMessage, setErrorMessage] = useState<string>("");

  // 초대 정보 조회 (무인증)
  const {
    data: inviteInfo,
    isLoading: infoLoading,
    isError: infoError,
  } = useQuery({
    queryKey: ["inviteInfo", token],
    queryFn: () => getInviteInfo(token),
    retry: false,
  });

  // 초대 수락 mutation
  const acceptMutation = useMutation({
    mutationFn: () => acceptInvite(token),
    onSuccess: async (data) => {
      // 활성 냉장고 목록 새로고침 후 해당 냉장고를 활성으로 설정
      await refetchFridges();
      setActiveFridgeId(data.fridgeId);
      // URL에서 invite 파라미터 제거
      window.history.replaceState({}, "", window.location.pathname);
      onInviteAccepted();
    },
    onError: (error) => {
      setErrorMessage((error as Error).message);
    },
  });

  if (infoLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        <p className="text-gray-500">초대 정보 확인 중…</p>
      </main>
    );
  }

  if (infoError || !inviteInfo) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-red-700">초대 정보를 불러올 수 없습니다.</p>
        <button
          onClick={() => window.history.back()}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          뒤로가기
        </button>
      </main>
    );
  }

  if (inviteInfo.expired) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-semibold text-red-700">초대 링크 만료됨</p>
        <p className="text-sm text-gray-600">
          이 초대 링크는 유효 기간이 만료되었습니다.
        </p>
        <button
          onClick={() => window.history.back()}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          뒤로가기
        </button>
      </main>
    );
  }

  if (inviteInfo.accepted) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-semibold text-blue-700">이미 수락된 초대</p>
        <p className="text-sm text-gray-600">
          이미 이 냉장고의 멤버입니다.
        </p>
        <button
          onClick={() => window.history.back()}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          뒤로가기
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-8">
      <div className="text-center">
        <div className="text-5xl mb-2">🧊</div>
        <h1 className="text-2xl font-bold text-green-700">공유 냉장고 초대</h1>
      </div>

      <div className="w-full space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
        <p className="text-sm text-gray-600">
          다음 냉장고에 초대되었습니다:
        </p>
        <p className="text-lg font-semibold text-blue-800">
          {inviteInfo.fridgeName}
        </p>
        <p className="text-xs text-gray-500">
          역할: {inviteInfo.role === "owner" ? "소유자" : "멤버"}
        </p>
      </div>

      {errorMessage && (
        <div className="w-full rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {session ? (
        <button
          onClick={() => acceptMutation.mutate()}
          disabled={acceptMutation.isPending}
          className="w-full rounded-lg bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {acceptMutation.isPending ? "처리 중…" : "이 냉장고에 참여"}
        </button>
      ) : (
        <div className="w-full space-y-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
          <p className="text-sm text-yellow-800">
            참여하려면 먼저 로그인해야 합니다.
          </p>
          <p className="text-xs text-yellow-700">
            로그인 후 다시 이 초대 링크를 열어주세요.
          </p>
        </div>
      )}
    </main>
  );
}
