#!/usr/bin/env bash
set -euo pipefail

HOOK_NAME="power-presentation/render-rewake"
ENFORCE="${POWER_PRESENTATION_HOOKS_ENFORCE:-0}"
INPUT="$(cat 2>/dev/null || true)"

log() { printf '%s: %s\n' "$HOOK_NAME" "$*" >&2; }

if ! command -v jq >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
  log "neither jq nor python3 available; cannot read hook input — skipping"
  exit 0
fi

json_get() {
  local path="$1"
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r "$path | if . == null then empty elif type == \"string\" then . else tojson end" 2>/dev/null || true
  else
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
  fi
}

mtime_of() {
  local f="$1"
  [[ -e "$f" ]] || { printf '0'; return; }
  stat -c %Y -- "$f" 2>/dev/null || stat -f %m -- "$f" 2>/dev/null || printf '0'
}

manifest_last_entry() {
  local f="$1" last
  [[ -f "$f" ]] || return 0
  last="$(sed '/^[[:space:]]*$/d' "$f" | tail -n 1)"
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$last" | jq -c 'if type=="array" then (.[-1] // empty) else . end' 2>/dev/null \
      || jq -c 'if type=="array" then (.[-1] // empty) else . end' "$f" 2>/dev/null \
      || printf '%s\n' "$last"
  else
    python3 -c '
import json, sys
f, last = sys.argv[1], sys.argv[2]
try:
    d = json.loads(last)
    d = d[-1] if isinstance(d, list) and d else d
    print(json.dumps(d, separators=(",", ":")))
except Exception:
    try:
        d = json.load(open(f))
        d = d[-1] if isinstance(d, list) and d else d
        print(json.dumps(d, separators=(",", ":")))
    except Exception:
        print(last)
' "$f" "$last" 2>/dev/null || printf '%s\n' "$last"
  fi
}

CMD="$(json_get .tool_input.command)"
[[ -n "$CMD" ]] || exit 0
RENDER_RE='hyperframes(@[^[:space:]]+)?[[:space:]]+render([[:space:]]|$)'
[[ "$CMD" =~ $RENDER_RE ]] || exit 0

AGENT_TYPE="$(json_get .agent_type)"
RUN_BG="$(json_get .tool_input.run_in_background)"
MODE=""
case "$AGENT_TYPE" in *render-worker*) MODE="render-worker" ;; esac
if [[ -z "$MODE" && "$RUN_BG" == "true" ]]; then MODE="run_in_background"; fi
if [[ -z "$MODE" ]]; then
  log "foreground render, not a rewake candidate: $CMD"
  exit 0
fi

SESSION_CWD="$(json_get .cwd)"
[[ -n "$SESSION_CWD" && -d "$SESSION_CWD" ]] || SESSION_CWD="$PWD"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/project-root.sh"
ROOT="$(project_root "$CMD" "$SESSION_CWD")"
cd "$ROOT"
MANIFEST="renders/manifest.json"

DURATION_MS="$(json_get .duration_ms)"
DURATION_S=$(( ${DURATION_MS:-0} / 1000 ))
NOW="$(date +%s)"
CHANGED=0

if [[ "$MODE" == "render-worker" ]]; then
  MT="$(mtime_of "$MANIFEST")"
  if [[ "$MT" -gt 0 && $(( NOW - MT )) -le $(( DURATION_S + 5 )) ]]; then CHANGED=1; fi
else
  MT0="$(mtime_of "$MANIFEST")"
  for _ in 1 2 3 4 5 6 7 8; do
    sleep 1
    MT="$(mtime_of "$MANIFEST")"
    if [[ "$MT" -ne "$MT0" ]]; then CHANGED=1; break; fi
  done
fi

if [[ $CHANGED -eq 0 ]]; then
  log "$MODE render: $MANIFEST unchanged (no wake). Command: $CMD"
  exit 0
fi

INTERRUPTED="$(json_get .tool_response.interrupted)"
ENTRY="$(manifest_last_entry "$MANIFEST" | head -c 400 || true)"
SUMMARY="power-presentation: background render finished ($MODE, ${DURATION_S}s, interrupted=${INTERRUPTED:-false}); $MANIFEST updated: ${ENTRY:-<unreadable entry>} — next: present-qa gates on the mp4, then deliver."

if [[ "$ENFORCE" == "1" ]]; then
  printf '%s\n' "$SUMMARY" >&2
  exit 2
fi
log "dry-run: would exit 2 to wake Claude with: $SUMMARY"
exit 0
