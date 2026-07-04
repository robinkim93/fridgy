import { useQuery } from "@tanstack/react-query";
import { getReceiptJob } from "../../lib/api";
import type { ParsedItem } from "@fridgy/shared";

interface ProcessingPollerProps {
  jobId: string;
  onDone: (items: ParsedItem[]) => void;
  onRetry: () => void;
}

export function ProcessingPoller({
  jobId,
  onDone,
  onRetry,
}: ProcessingPollerProps) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["receipt", jobId],
    queryFn: () => getReceiptJob(jobId),
    // 2초 간격 폴링. done 또는 failed 상태이면 자동 중단
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "processing" ? 2000 : false;
    },
    retry: false,
  });

  // done 상태 → 보정 UI로 진행
  if (data?.status === "done" && data.items) {
    onDone(data.items);
    return null; // 보정 UI가 렌더링됨
  }

  // failed 상태 → 에러 표시
  if (data?.status === "failed") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <p className="font-medium">처리 실패</p>
          <p className="text-sm">{data.error || "알 수 없는 오류"}</p>
        </div>
        <button
          onClick={onRetry}
          className="w-full rounded-lg bg-gray-600 px-4 py-2 font-medium text-white hover:bg-gray-700"
        >
          다시 시도
        </button>
      </div>
    );
  }

  // processing 또는 초기 로딩 상태
  if (isLoading || data?.status === "processing") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        <p className="text-center text-gray-600">영수증 처리 중…</p>
        <p className="text-center text-sm text-gray-500">
          OCR 분석 및 품목 정규화 중입니다. 잠시만 기다려주세요.
        </p>
      </div>
    );
  }

  // fetch 오류
  if (isError) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <p className="font-medium">조회 오류</p>
          <p className="text-sm">
            {error instanceof Error ? error.message : "연결을 확인하세요."}
          </p>
        </div>
        <button
          onClick={onRetry}
          className="w-full rounded-lg bg-gray-600 px-4 py-2 font-medium text-white hover:bg-gray-700"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return null;
}
