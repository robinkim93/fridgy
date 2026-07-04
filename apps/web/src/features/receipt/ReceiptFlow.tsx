import { useState } from "react";
import type { ParsedItem } from "@fridgy/shared";
import { UploadButton } from "./UploadButton";
import { ProcessingPoller } from "./ProcessingPoller";
import { CorrectionForm } from "./CorrectionForm";

type FlowState = "upload" | "processing" | "correction" | "success";

interface ReceiptFlowProps {
  onDashboardReturn: () => void;
}

export function ReceiptFlow({ onDashboardReturn }: ReceiptFlowProps) {
  const [state, setState] = useState<FlowState>("upload");
  const [jobId, setJobId] = useState<string>("");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [error, setError] = useState<string>("");

  const handleJobCreated = (newJobId: string) => {
    setJobId(newJobId);
    setError("");
    setState("processing");
  };

  const handleProcessingDone = (processedItems: ParsedItem[]) => {
    setItems(processedItems);
    setState("correction");
  };

  const handleConfirmSuccess = () => {
    setState("success");
  };

  const handleRetry = () => {
    setState("upload");
    setJobId("");
    setItems([]);
    setError("");
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-8">
      <div className="w-full">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-green-700">Fridgy</h1>
          <p className="text-sm text-gray-500">영수증으로 재고 등록</p>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* 상태별 UI */}
        {state === "upload" && (
          <UploadButton onJobCreated={handleJobCreated} onError={setError} />
        )}

        {state === "processing" && jobId && (
          <ProcessingPoller
            jobId={jobId}
            onDone={handleProcessingDone}
            onRetry={handleRetry}
          />
        )}

        {state === "correction" && items.length > 0 && (
          <CorrectionForm
            initialItems={items}
            jobId={jobId || undefined}
            onSuccess={handleConfirmSuccess}
            onError={setError}
          />
        )}

        {state === "success" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
              <p className="text-3xl mb-2">✓</p>
              <p className="font-semibold text-green-700">재고 등록 완료!</p>
              <p className="mt-2 text-sm text-green-600">
                영수증 품목이 재고에 추가되었습니다.
              </p>
            </div>
            <button
              onClick={onDashboardReturn}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700"
            >
              대시보드로 돌아가기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
