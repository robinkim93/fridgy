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

    # NVIDIA NIM (OCR·LLM 추론)
    nim_api_key: str = ""

    # 내부 배치 엔드포인트 보호 토큰 (GitHub Actions cron)
    internal_token: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
