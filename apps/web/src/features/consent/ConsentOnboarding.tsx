import { useState } from "react";
import { useUpdateConsent } from "./useConsent";

interface ConsentOnboardingProps {
  onDone: () => void;
}

/** 첫 로그인 후 1회 노출되는 동의 온보딩 (SD-2 DoD: 동의 없이는 수집되지 않는다). */
export function ConsentOnboarding({ onDone }: ConsentOnboardingProps) {
  const update = useUpdateConsent();
  const [retain, setRetain] = useState(false);

  const decide = (dataConsent: boolean) => {
    update.mutate(
      { dataConsent, receiptRetain: retain, onboarded: true },
      { onSuccess: onDone }
    );
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-6 py-8">
      <div className="text-center">
        <div className="mb-2 text-4xl">🔒</div>
        <h1 className="text-xl font-bold text-green-700">데이터 사용 동의</h1>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
        <p>
          Fridgy는 정규화·추천 정확도 개선을 위해{" "}
          <span className="font-medium text-gray-800">익명 집계 데이터</span>만
          사용합니다. 영수증 원본은 품목 추출 후 파기하는 것이 기본입니다.
        </p>
        <label className="flex items-center gap-2 text-gray-700">
          <input
            type="checkbox"
            checked={retain}
            onChange={(e) => setRetain(e.currentTarget.checked)}
            className="h-4 w-4"
          />
          영수증 원본을 계정에 보관 (기본: 파기)
        </label>
        <a
          href="https://fridgy.app/privacy"
          target="_blank"
          rel="noreferrer"
          className="inline-block text-xs text-blue-600 underline"
        >
          개인정보 처리방침
        </a>
      </div>

      {update.isError && (
        <p className="text-sm text-red-600">
          {(update.error as Error).message}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button
          onClick={() => decide(true)}
          disabled={update.isPending}
          className="w-full rounded-lg bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          동의하고 시작하기
        </button>
        <button
          onClick={() => decide(false)}
          disabled={update.isPending}
          className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 font-medium text-gray-600 hover:border-gray-400 disabled:opacity-50"
        >
          동의 없이 사용
        </button>
      </div>
    </main>
  );
}
