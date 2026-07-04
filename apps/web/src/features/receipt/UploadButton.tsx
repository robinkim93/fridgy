import { useRef, useState } from "react";
import { createReceipt } from "../../lib/api";

interface UploadButtonProps {
  onJobCreated: (jobId: string) => void;
  onError: (message: string) => void;
  isLoading?: boolean;
}

export function UploadButton({
  onJobCreated,
  onError,
  isLoading = false,
}: UploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  /** 파일 선택/카메라 촬영 → 즉시 업로드 */
  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      onError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    setUploading(true);
    try {
      const { jobId } = await createReceipt(file);
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

  return (
    <div className="flex flex-col gap-3">
      {/* 카메라 촬영 */}
      <button
        onClick={() => cameraInputRef.current?.click()}
        disabled={uploading || isLoading}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {uploading ? "업로드 중…" : "📷 카메라로 촬영"}
      </button>

      {/* 파일 업로드 */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading || isLoading}
        className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 font-medium text-gray-700 hover:border-gray-400 disabled:opacity-50"
      >
        {uploading ? "업로드 중…" : "📁 파일 선택"}
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
        accept="image/*"
        onChange={handleInputChange(fileInputRef)}
        className="hidden"
      />
    </div>
  );
}
