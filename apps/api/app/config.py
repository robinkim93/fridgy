from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """환경 변수 기반 설정. 시크릿은 각 배포 환경(Fly.io secrets)에 등록한다."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "fridgy-api"
    version: str = "0.0.0"

    # CORS: 프런트(Cloudflare Pages) 도메인. 콤마 구분.
    cors_origins: str = "http://localhost:5173"

    # Supabase (Auth JWT 검증·DB·Storage)
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""

    # NVIDIA NIM (OCR·LLM 추론) — OpenAI 호환 엔드포인트
    nim_api_key: str = ""
    nim_base_url: str = "https://integrate.api.nvidia.com/v1"
    # 모델 id는 배포 환경에서 override 가능(무료 티어 가용 모델에 맞춰 조정).
    nim_ocr_model: str = "meta/llama-3.2-90b-vision-instruct"
    nim_llm_model: str = "nvidia/llama-3.1-nemotron-70b-instruct"

    # Supabase Storage 영수증 버킷
    receipts_bucket: str = "receipts"

    # 내부 배치 엔드포인트 보호 토큰 (GitHub Actions cron)
    internal_token: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
