# Fridge Guardian AI

냉장고 식재료 유통기한 관리 + 임박 재료 레시피 추천 서비스(PWA, 비용 $0 지향).
기획/설계 문서: [01_기획서.md](01_기획서.md) · [02_기술아키텍처.md](02_기술아키텍처.md) · [03_개발계획.md](03_개발계획.md) · [04_데이터수집_PH런칭.md](04_데이터수집_PH런칭.md) · [05_수익화_가격정책.md](05_수익화_가격정책.md)

## Git 워크플로우 (반드시 준수)

브랜치 흐름: **main > dev > feature**

1. **main 브랜치는 명시적 요청이 없는 한 절대 건드리지 않는다.**
   - main으로의 commit/merge/push는 금지. `.claude/hooks/protect-main.sh` (PreToolUse hook)가 이를 강제 차단한다.
   - 사용자가 명시적으로 main 변경을 요청한 경우에만, 승인 후 명령 앞에 `FG_ALLOW_MAIN=1` 을 붙여 우회한다.
2. **작업은 항상 dev에서 파생한 feature 브랜치에서 진행한다.**
   - 새 작업 시작 시: `git switch dev && git switch -c feature/<작업명>`
   - 브랜치 이름 규칙: `feature/<간단한-작업설명>` (예: `feature/receipt-ocr`)
3. **작업 후 원격 dev 업로드는 사용자 의사를 먼저 묻는다.**
   - 작업(커밋)을 마치면 "원격 dev에 push할까요?"를 반드시 물어보고, 답변대로만 진행한다.
   - 승인 시: feature 브랜치를 push하거나, 합의된 방식으로 dev에 반영 후 push.
   - 거절 시: 로컬 커밋만 유지하고 push하지 않는다.
4. 커밋/푸시는 사용자가 요청하거나 승인했을 때만 수행한다(임의로 하지 않는다).
