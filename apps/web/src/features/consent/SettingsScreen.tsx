import { useConsent, useUpdateConsent } from "./useConsent";
import { Button } from "../../ui/primitives";

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface p-4 shadow-sm">
      <span className="min-w-0">
        <span className="block font-semibold text-ink">{label}</span>
        <span className="mt-1 block text-xs text-ink-soft">{hint}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-brand"
      />
    </label>
  );
}

/** 동의·거버넌스 설정 (SD-2). 언제든 데이터 수집·영수증 보관을 변경. */
export function SettingsScreen() {
  const { data, isLoading } = useConsent(true);
  const update = useUpdateConsent();
  const busy = isLoading || update.isPending;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-ink">설정</h1>

      <h2 className="text-sm font-semibold text-ink-faint">개인정보 · 데이터</h2>

      <Toggle
        label="익명 데이터로 개선에 사용"
        hint="정규화·추천 정확도 향상을 위한 익명 집계에만 사용합니다."
        checked={!!data?.dataConsent}
        disabled={busy}
        onChange={(v) => update.mutate({ dataConsent: v })}
      />

      <Toggle
        label="영수증 원본 보관"
        hint="끄면 품목 추출 후 원본을 파기합니다(기본)."
        checked={!!data?.receiptRetain}
        disabled={busy}
        onChange={(v) => update.mutate({ receiptRetain: v })}
      />

      {update.isError && (
        <p className="text-sm text-urgent">{(update.error as Error).message}</p>
      )}

      <a
        href="https://fridgy.app/privacy"
        target="_blank"
        rel="noreferrer"
        className="mt-2 text-xs font-medium text-brand-600 underline"
      >
        개인정보 처리방침
      </a>

      <div className="mt-4 border-t border-line pt-4">
        <Button
          block
          onClick={async () => {
            const { error } = await import("../../lib/supabase").then(
              ({ supabase }) => supabase.auth.signOut()
            );
            if (error) alert(`로그아웃 실패: ${error.message}`);
          }}
        >
          로그아웃
        </Button>
      </div>
    </div>
  );
}
