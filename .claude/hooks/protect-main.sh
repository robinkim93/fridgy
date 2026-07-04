#!/usr/bin/env bash
# main 브랜치 보호 hook (PreToolUse / Bash)
# 규칙: main 브랜치는 명시적 요청 없이는 변경하지 않는다.
#   - 원격 main 으로의 push 차단
#   - 현재 브랜치가 main 일 때의 commit/merge/rebase/reset/cherry-pick/revert 차단
# 우회: 사용자가 명시적으로 승인한 경우에만 명령 앞에 FG_ALLOW_MAIN=1 을 붙여 실행.
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")

# git 명령이 아니면 통과
printf '%s' "$cmd" | grep -Eq '\bgit\b' || exit 0

# 명시적 우회 토큰
case "$cmd" in
  *FG_ALLOW_MAIN=1*) exit 0 ;;
esac

deny() {
  jq -n --arg r "$1" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

msg='main 브랜치 보호: main을 직접 변경할 수 없습니다. dev에서 파생한 feature 브랜치에서 작업하세요. 정말 필요하면 사용자 승인 후 명령 앞에 FG_ALLOW_MAIN=1 을 붙여 실행합니다.'

# 현재 브랜치(best-effort)
branch=$(git branch --show-current 2>/dev/null || echo "")

# 1) 원격 main 으로의 push (현재 브랜치와 무관하게 차단)
if printf '%s' "$cmd" | grep -Eq '\bgit\b.*\bpush\b'; then
  if printf '%s' "$cmd" | grep -Eq '(:|[[:space:]])main([[:space:]]|$)'; then
    deny "$msg (원격 main push 차단)"
  fi
fi

# 2) 현재 브랜치가 main 일 때의 변경/푸시 차단
if [ "$branch" = "main" ]; then
  if printf '%s' "$cmd" | grep -Eq '\bgit\b[[:space:]]+(commit|merge|rebase|reset|cherry-pick|revert|am)\b'; then
    deny "$msg (main에서 변경 명령 차단)"
  fi
  if printf '%s' "$cmd" | grep -Eq '\bgit\b.*\bpush\b'; then
    deny "$msg (main에서 push 차단)"
  fi
fi

exit 0
