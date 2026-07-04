import type { HealthResponse } from "@fridgy/shared";

// Fly.io 배포 API URL. 로컬은 .env로 http://localhost:8000 사용.
export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
