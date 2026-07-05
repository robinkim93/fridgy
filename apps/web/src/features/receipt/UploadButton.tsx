import { useRef, useState } from "react";
import { createReceipt } from "../../lib/api";
import { track } from "../../lib/track";

interface UploadButtonProps {
  onJobCreated: (jobId: string) => void;
  onError: (message: string) => void;
  isLoading?: boolean;
  fridgeId?: string;
}

/** 이미지 + PDF(F8 온라인 장보기 영수증) 허용 */
function isAccepted(file: File): boolean {
  return file.type.startsWith("image/") || file.type === "application/pdf";
}

export function UploadButton({
  onJobCreated,
  onError,
  isLoading = false,
  fridgeId,
}: UploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  /** 파일 선택/카메라 촬영/드롭 → 즉시 업로드 */
  const handleFileSelect = async (file: File) => {
    if (!isAccepted(file)) {
      onError("이미지 또는 PDF 파일만 업로드할 수 있습니다.");
      return;
    }

    setUploading(true);
    try {
      const { jobId } = await createReceipt(file, fridgeId);
      track("receipt_uploaded", {
        kind: file.type === "application/pdf" ? "pdf" : "image",
      });
      onJobCreated(jobId);
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : "영수증 업로드 중 오류가 발생했습니다."
      );
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange =
    (inputRef: React.RefObject<HTMLInputElement>) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.currentTarget.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
      // 파일 input 초기화 (같은 파일 선택 가능하도록)
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const busy = uploading || isLoading;

  return (
    <div className="flex flex-col gap-3">
      {/* 드래그 & 드롭 영역 (데스크톱 파일/PDF) */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !busy && fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
          dragOver
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        } ${busy ? "pointer-events-none opacity-50" : ""}`}
      >
        <span className="text-2xl">📎</span>
        <p className="text-sm font-medium text-gray-700">
          {uploading ? "업로드 중…" : "여기로 영수증을 끌어다 놓기"}
        </p>
        <p className="text-xs text-gray-400">이미지 또는 PDF · 클릭해서 선택</p>
      </div>

      {/* 카메라 촬영 (모바일) */}
      <button
        onClick={() => cameraInputRef.current?.click()}
        disabled={busy}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {uploading ? "업로드 중…" : "📷 카메라로 촬영"}
      </button>

      {/* 숨겨진 입력 필드 */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInputChange(cameraInputRef)}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={handleInputChange(fileInputRef)}
        className="hidden"
      />
    </div>
  );
}
