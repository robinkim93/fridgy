import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConsentState } from "@fridgy/shared";
import { getConsent, updateConsent } from "../../lib/api";
import { setTrackingConsent } from "../../lib/track";

/** 동의 상태를 조회하고, dataConsent를 트래커에 반영한다(SD-1↔SD-2 연동). */
export function useConsent(enabled: boolean) {
  const query = useQuery({
    queryKey: ["consent"],
    queryFn: getConsent,
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    // 조회 성공 시 트래커 게이팅 갱신. 실패(미로그인 등)면 비수집 유지.
    setTrackingConsent(!!query.data?.dataConsent);
  }, [query.data?.dataConsent]);

  return query;
}

/** 동의 부분 갱신 mutation. 성공 시 캐시 갱신 + 트래커 반영. */
export function useUpdateConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<ConsentState>) => updateConsent(patch),
    onSuccess: (data) => {
      qc.setQueryData(["consent"], data);
      setTrackingConsent(data.dataConsent);
    },
  });
}
