import { useQuery } from "@tanstack/react-query";
import type { WasteMonth } from "@fridgy/shared";
import { getWasteReport } from "../../lib/api";
import { useActiveFridge } from "../fridge/useActiveFridge";

export function ReportScreen() {
  const { activeFridgeId } = useActiveFridge();

  const {
    data: report,
    isLoading,
    isError,
    error: errorObj,
  } = useQuery({
    queryKey: ["wasteReport", activeFridgeId],
    queryFn: () => getWasteReport(activeFridgeId, 6),
    retry: false,
  });

  const error = errorObj instanceof Error ? errorObj.message : "알 수 없는 오류";

  // 최대 count를 구해서 차트 높이 정규화
  const allCounts = report?.months.flatMap((m) => [m.consumedCount, m.discardedCount]) || [];
  const maxCount = Math.max(...allCounts, 1); // 0이면 1로 대체해 division by zero 방지

  // 포맷팅 헬퍼
  const formatKRW = (amount: number): string => {
    return amount === 0 ? "—" : `₩${Math.round(amount).toLocaleString()}`;
  };

  // 월 라벨 포맷팅 (예: "2026-07" → "07월")
  const formatMonthLabel = (month: string): string => {
    const [, mm] = month.split("-");
    return `${mm}월`;
  };

  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-ink">절약/낭비 리포트</h1>
        <p className="mt-1 text-sm text-ink-soft">지난 6개월 소비·폐기 통계</p>
      </div>

      {/* 로딩 상태 */}
      {isLoading && (
        <div className="text-center text-ink-faint">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-brand" />
          <p className="mt-2">리포트 로드 중…</p>
        </div>
      )}

      {/* 에러 상태 */}
      {isError && (
        <div className="rounded-lg border border-urgent/30 bg-urgent-tint p-4 text-center text-[#B91C1C]">
          <p className="font-semibold">리포트 조회 실패</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}

      {/* 데이터 표시 */}
      {report && !isLoading && (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-3 gap-3">
            {/* 아낀 추정액 */}
            <div className="rounded-lg border border-line bg-fresh-tint p-4 text-center shadow-sm">
              <p className="text-xs text-ink-soft">이번 기간</p>
              <p className="text-xs text-ink-soft">아낀 추정액</p>
              <p className="tnum mt-2 text-lg font-bold text-brand-600">
                {formatKRW(report.totals.savedAmount)}
              </p>
            </div>

            {/* 버린 추정액 */}
            <div className="rounded-lg border border-line bg-urgent-tint p-4 text-center shadow-sm">
              <p className="text-xs text-ink-soft">버린</p>
              <p className="text-xs text-ink-soft">추정액</p>
              <p className="tnum mt-2 text-lg font-bold text-[#B91C1C]">
                {formatKRW(report.totals.wastedAmount)}
              </p>
            </div>

            {/* 폐기 건수 */}
            <div className="rounded-lg border border-line bg-soon-tint p-4 text-center shadow-sm">
              <p className="text-xs text-ink-soft">폐기</p>
              <p className="text-xs text-ink-soft">건수</p>
              <p className="tnum mt-2 text-lg font-bold text-[#B45309]">
                {report.totals.discardedCount}건
              </p>
            </div>
          </div>

          {/* 월별 차트 */}
          <div>
            <h2 className="font-semibold text-ink">월별 소비·폐기</h2>
            {maxCount === 0 ? (
              <p className="mt-4 text-center text-sm text-ink-faint">
                아직 소비/폐기 기록이 없어요
              </p>
            ) : (
              <div className="mt-4 flex items-end justify-center gap-2" style={{ height: "200px" }}>
                {report.months.map((month: WasteMonth) => {
                  const consumedPercent = (month.consumedCount / maxCount) * 100;
                  const discardedPercent = (month.discardedCount / maxCount) * 100;
                  return (
                    <div key={month.month} className="flex flex-col items-center gap-1">
                      {/* 스택된 바 */}
                      <div
                        className="flex flex-col-reverse gap-0.5 overflow-hidden rounded-md"
                        style={{ width: "32px", height: "160px" }}
                      >
                        {/* 소비 (그린) */}
                        <div
                          className="rounded-sm bg-fresh"
                          style={{
                            height: `${consumedPercent}%`,
                            minHeight: consumedPercent > 0 ? "3px" : "0",
                          }}
                          title={`소비: ${month.consumedCount}`}
                        />
                        {/* 폐기 (앰버) */}
                        <div
                          className="rounded-sm bg-soon"
                          style={{
                            height: `${discardedPercent}%`,
                            minHeight: discardedPercent > 0 ? "3px" : "0",
                          }}
                          title={`폐기: ${month.discardedCount}`}
                        />
                      </div>
                      {/* 월 라벨 */}
                      <p className="tnum text-xs text-ink-soft">{formatMonthLabel(month.month)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 범례 */}
          <div className="flex justify-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-fresh" />
              <span className="text-ink-soft">소비</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-soon" />
              <span className="text-ink-soft">폐기</span>
            </div>
          </div>

          {/* 상위 폐기 품목 */}
          {report.topDiscarded.length > 0 && (
            <div>
              <h2 className="font-semibold text-ink">자주 버리는 품목</h2>
              <ol className="mt-3 space-y-2">
                {report.topDiscarded.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 text-sm shadow-sm"
                  >
                    <span className="tnum flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-ink-soft">
                      {idx + 1}
                    </span>
                    <span className="flex-1 font-medium text-ink">{item.name}</span>
                    <span className="tnum text-xs text-ink-faint">{item.count}회</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </main>
  );
}
