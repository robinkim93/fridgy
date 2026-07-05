import { useQuery } from "@tanstack/react-query";
import type { WasteMonth } from "@fridgy/shared";
import { getWasteReport } from "../../lib/api";
import { useActiveFridge } from "../fridge/useActiveFridge";

interface ReportScreenProps {
  onDashboardReturn: () => void;
}

export function ReportScreen({ onDashboardReturn }: ReportScreenProps) {
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-8">
      {/* 헤더 */}
      <button
        onClick={onDashboardReturn}
        className="text-left text-gray-600 hover:text-gray-800"
      >
        ← 대시보드
      </button>

      <div className="text-center">
        <h1 className="text-2xl font-bold text-green-700">절약/낭비 리포트</h1>
        <p className="mt-1 text-sm text-gray-500">지난 6개월 소비·폐기 통계</p>
      </div>

      {/* 로딩 상태 */}
      {isLoading && (
        <div className="text-center text-gray-500">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-green-600" />
          <p className="mt-2">리포트 로드 중…</p>
        </div>
      )}

      {/* 에러 상태 */}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-red-700">
          <p className="font-medium">리포트 조회 실패</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}

      {/* 데이터 표시 */}
      {report && !isLoading && (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-3 gap-3">
            {/* 아낀 추정액 */}
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
              <p className="text-xs text-gray-600">이번 기간</p>
              <p className="text-xs text-gray-600">아낀 추정액</p>
              <p className="mt-2 text-lg font-bold text-green-700">
                {formatKRW(report.totals.savedAmount)}
              </p>
            </div>

            {/* 버린 추정액 */}
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
              <p className="text-xs text-gray-600">버린</p>
              <p className="text-xs text-gray-600">추정액</p>
              <p className="mt-2 text-lg font-bold text-red-700">
                {formatKRW(report.totals.wastedAmount)}
              </p>
            </div>

            {/* 폐기 건수 */}
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-center">
              <p className="text-xs text-gray-600">폐기</p>
              <p className="text-xs text-gray-600">건수</p>
              <p className="mt-2 text-lg font-bold text-orange-700">
                {report.totals.discardedCount}건
              </p>
            </div>
          </div>

          {/* 월별 차트 */}
          <div>
            <h2 className="font-semibold text-gray-800">월별 소비·폐기</h2>
            {maxCount === 0 ? (
              <p className="mt-4 text-center text-sm text-gray-500">
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
                        className="flex flex-col-reverse gap-0 rounded-t"
                        style={{ width: "32px", height: "160px" }}
                      >
                        {/* 소비 (초록색) */}
                        <div
                          className="bg-green-600"
                          style={{
                            height: `${consumedPercent}%`,
                            minHeight: consumedPercent > 0 ? "2px" : "0",
                          }}
                          title={`소비: ${month.consumedCount}`}
                        />
                        {/* 폐기 (주황색) */}
                        <div
                          className="bg-orange-500"
                          style={{
                            height: `${discardedPercent}%`,
                            minHeight: discardedPercent > 0 ? "2px" : "0",
                          }}
                          title={`폐기: ${month.discardedCount}`}
                        />
                      </div>
                      {/* 월 라벨 */}
                      <p className="text-xs text-gray-600">{formatMonthLabel(month.month)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 범례 */}
          <div className="flex justify-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-green-600" />
              <span className="text-gray-600">소비</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-orange-500" />
              <span className="text-gray-600">폐기</span>
            </div>
          </div>

          {/* 상위 폐기 품목 */}
          {report.topDiscarded.length > 0 && (
            <div>
              <h2 className="font-semibold text-gray-800">자주 버리는 품목</h2>
              <ol className="mt-3 space-y-2">
                {report.topDiscarded.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm"
                  >
                    <span className="font-bold text-gray-400">{idx + 1}</span>
                    <span className="flex-1 text-gray-800">{item.name}</span>
                    <span className="text-xs text-gray-500">{item.count}회</span>
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
