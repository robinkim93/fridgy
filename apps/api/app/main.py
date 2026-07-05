from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import AuthUser, get_current_user
from .config import Settings, get_settings
from .routers import fridges, internal, inventory, push, receipts, recipes, reports

settings = get_settings()

app = FastAPI(title=settings.service_name, version=settings.version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(receipts.router)
app.include_router(fridges.router)
app.include_router(inventory.router)
app.include_router(recipes.router)
app.include_router(push.router)
app.include_router(reports.router)
app.include_router(internal.router)


@app.get("/health")
def health(settings: Settings = Depends(get_settings)) -> dict:
    """무인증 헬스체크 (Fly.io·배포 확인용)."""
    return {
        "status": "ok",
        "service": settings.service_name,
        "version": settings.version,
    }


@app.get("/me")
def me(user: AuthUser = Depends(get_current_user)) -> dict:
    """인증된 요청을 구분하는지 확인하는 엔드포인트 (S0 DoD)."""
    return {"user_id": user.user_id, "email": user.email}
