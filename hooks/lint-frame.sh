#!/usr/bin/env bash
set -euo pipefail

HOOK_NAME="power-presentation/lint-frame"
ENFORCE="${POWER_PRESENTATION_HOOKS_ENFORCE:-0}"
INPUT="$(cat 2>/dev/null || true)"

log() { printf '%s: %s\n' "$HOOK_NAME" "$*" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-${POWER_PRESENTATION_DATA:-$HOME/.claude/plugins/data/power-presentation}}"

json_get() {
  local path="$1"
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r "$path | if . == null then empty elif type == \"string\" then . else tojson end" 2>/dev/null || true
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$INPUT" | python3 -c '
import json, sys
path = [p for p in sys.argv[1].split(".") if p]
try:
    obj = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for key in path:
    if isinstance(obj, dict) and key in obj:
        obj = obj[key]
    else:
        sys.exit(0)
if obj is None:
    sys.exit(0)
if isinstance(obj, bool):
    obj = "true" if obj else "false"
sys.stdout.write(obj if isinstance(obj, str) else json.dumps(obj))
' "$path" 2>/dev/null || true
  else
    log "neither jq nor python3 available; cannot read hook input — skipping"
  fi
}

run_capped() {
  local secs="$1"; shift
  if command -v timeout >/dev/null 2>&1; then timeout "$secs" "$@"; else "$@"; fi
}

FILE="$(json_get .tool_input.file_path)"
[[ -n "$FILE" ]] || exit 0

case "$FILE" in
  */compositions/frames/*.html) ;;
  *) exit 0 ;;
esac

CWD="$(json_get .cwd)"
if [[ -n "$CWD" && -d "$CWD" ]]; then cd "$CWD"; fi

PROJECT="${FILE%/compositions/frames/*}"
[[ "$PROJECT" != "$FILE" && -n "$PROJECT" ]] || PROJECT="."
REL="compositions/frames/${FILE##*/compositions/frames/}"

HF_CMD=()
if [[ -x "$PLUGIN_DATA/toolchain/node_modules/.bin/hyperframes" ]]; then
  HF_CMD=("$PLUGIN_DATA/toolchain/node_modules/.bin/hyperframes")
elif command -v hyperframes >/dev/null 2>&1; then
  HF_CMD=(hyperframes)
elif command -v npx >/dev/null 2>&1; then
  HF_CMD=(npx --no-install hyperframes)
fi

if [[ "$ENFORCE" != "1" ]]; then
  log "dry-run: would run '${HF_CMD[*]:-hyperframes} lint $PROJECT --json' and keep the findings for $REL (QA-02). Set POWER_PRESENTATION_HOOKS_ENFORCE=1 to enforce."
  exit 0
fi

if [[ ${#HF_CMD[@]} -eq 0 ]]; then
  log "lint NOT run for $FILE: hyperframes CLI unavailable (not in \${CLAUDE_PLUGIN_DATA}/toolchain, on PATH, or via npx — run \`node $PLUGIN_ROOT/scripts/toolchain.mjs install\`). The frame is unverified (QA-02)."
  exit 2
fi

set +e
LINT_OUT="$(run_capped 25 "${HF_CMD[@]}" lint "$PROJECT" --json 2>&1)"
LINT_RC=$?
set -e

if [[ $LINT_RC -eq 124 ]]; then
  log "lint timed out after 25 s for $FILE (hook budget 30 s); frame unverified (QA-02)"
  exit 2
fi

FILE_FINDINGS=""
PARSED=0
if [[ -n "$LINT_OUT" ]] && command -v jq >/dev/null 2>&1; then
  if printf '%s' "$LINT_OUT" | jq -e '.findings | type == "array"' >/dev/null 2>&1; then
    PARSED=1
    FILE_FINDINGS="$(printf '%s' "$LINT_OUT" | jq -c --arg rel "$REL" \
      '.findings[]? | select((.file // "" | tostring) | endswith($rel))' 2>/dev/null || true)"
  fi
fi
if [[ $PARSED -eq 0 && -n "$LINT_OUT" ]]; then
  FILE_FINDINGS="$(printf '%s\n' "$LINT_OUT" | grep -F -e "$REL" -e "${FILE##*/}" || true)"
fi

if [[ -z "$FILE_FINDINGS" ]]; then
  if [[ $LINT_RC -eq 0 ]]; then
    log "lint ok for $REL (project $PROJECT, whole-project lint exit 0)"
    exit 0
  fi
  if [[ $PARSED -eq 1 ]]; then
    OTHER="$(printf '%s' "$LINT_OUT" | jq -r '[.findings[]? | .file // "?"] | unique | join(", ")' 2>/dev/null || true)"
    log "no finding names $REL; whole-project lint exit $LINT_RC with findings in: ${OTHER:-?} (present-qa runs the full lint/check gate, QA-02)"
    exit 0
  fi
fi

{
  printf '%s: hyperframes lint reported problems (exit %s) for %s — fix before check/render (QA-02, one artifact per step).\n' "$HOOK_NAME" "$LINT_RC" "$REL"
  if [[ -n "$FILE_FINDINGS" ]]; then
    printf '%s\n' "$FILE_FINDINGS" | tail -n 40
  else
    printf '(no finding names %s; whole-project lint output follows — another file or the project may be at fault)\n' "$REL"
    printf '%s\n' "$LINT_OUT" | tail -n 40
  fi
} >&2
exit 2
