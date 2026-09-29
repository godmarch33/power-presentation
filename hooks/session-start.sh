#!/usr/bin/env bash
set -euo pipefail

HOOK_NAME="power-presentation/session-start"
INPUT="$(cat 2>/dev/null || true)"

log() { printf '%s: %s\n' "$HOOK_NAME" "$*" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-${POWER_PRESENTATION_DATA:-$HOME/.claude/plugins/data/power-presentation}}"
export CLAUDE_PLUGIN_DATA="$PLUGIN_DATA"

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
  fi
}

json_file_get() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  if command -v jq >/dev/null 2>&1; then
    jq -r ".$key | if . == null then empty elif type == \"string\" then . else tojson end" "$file" 2>/dev/null || true
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys
try:
    v = json.load(open(sys.argv[1])).get(sys.argv[2])
    sys.stdout.write(v if isinstance(v, str) else ("" if v is None else json.dumps(v)))
except Exception:
    pass' "$file" "$key" 2>/dev/null || true
  fi
}

json_string() {
  local s="$1"
  if command -v jq >/dev/null 2>&1; then printf '%s' "$s" | jq -Rs . 2>/dev/null && return 0; fi
  if command -v python3 >/dev/null 2>&1; then python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' <<<"$s" 2>/dev/null && return 0; fi
  s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; s="${s//$'\n'/\\n}"; printf '"%s"' "$s"
}

run_capped() {
  local secs="$1"; shift
  if command -v timeout >/dev/null 2>&1; then timeout "$secs" "$@"; else "$@"; fi
}

SOURCE="$(json_get .source)"; SOURCE="${SOURCE:-unknown}"
PLUGIN_VERSION="$(json_file_get "$PLUGIN_ROOT/.claude-plugin/plugin.json" version)"; PLUGIN_VERSION="${PLUGIN_VERSION:-unknown}"
PRIVACY="${POWER_PRESENTATION_PRIVACY:-${CLAUDE_PLUGIN_OPTION_PRIVACY:-default}}"
[[ "$PRIVACY" == "local" ]] || PRIVACY="default"

mkdir -p "$PLUGIN_DATA" 2>/dev/null || log "cannot create $PLUGIN_DATA"

if ! command -v node >/dev/null 2>&1; then
  printf 'power-presentation %s (session %s): node is not on PATH — the toolchain cannot be probed or installed; install Node 22+ and restart. privacy=%s.\n' "$PLUGIN_VERSION" "$SOURCE" "$PRIVACY"
  exit 0
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [[ "${NODE_MAJOR:-0}" -lt 22 ]]; then
  printf 'power-presentation %s (session %s): node %s is too old — needs Node 22+; the toolchain is not probed or installed. privacy=%s.\n' "$PLUGIN_VERSION" "$SOURCE" "$(node --version 2>/dev/null)" "$PRIVACY"
  exit 0
fi

TOOLCHAIN_MJS="$PLUGIN_ROOT/scripts/toolchain.mjs"
VENDOR_MJS="$PLUGIN_ROOT/scripts/vendor-workflow.mjs"

run_capped 20 node "$TOOLCHAIN_MJS" adopt >>"$PLUGIN_DATA/hook.log" 2>&1 || true

STATUS_LINE="$(run_capped 25 node "$TOOLCHAIN_MJS" status --privacy "$PRIVACY" 2>>"$PLUGIN_DATA/hook.log" || true)"
STATUS_RC=0
run_capped 25 node "$TOOLCHAIN_MJS" status --privacy "$PRIVACY" >/dev/null 2>&1 || STATUS_RC=$?
[[ -n "$STATUS_LINE" ]] || STATUS_LINE="toolchain status unavailable (scripts/toolchain.mjs failed — see $PLUGIN_DATA/hook.log)"

RELOAD_SKILLS=0
SEED_NOTE=""
if [[ "${POWER_PRESENTATION_NO_SEED_WORKFLOW:-0}" != "1" && -f "$VENDOR_MJS" ]]; then
  SEED_JSON="$(run_capped 20 node "$VENDOR_MJS" seed --json 2>>"$PLUGIN_DATA/hook.log" || true)"
  if [[ -n "$SEED_JSON" ]]; then
    SEEDED="$(printf '%s' "$SEED_JSON" | { if command -v jq >/dev/null 2>&1; then jq -r '.seeded'; elif command -v python3 >/dev/null 2>&1; then python3 -c 'import json,sys; print(str(json.load(sys.stdin).get("seeded", False)).lower())'; else grep -o '"seeded": *true' | head -1 | sed 's/.*/true/'; fi; } 2>/dev/null || true)"
    if [[ "$SEEDED" == "true" ]]; then
      RELOAD_SKILLS=1
      SEED_NOTE="product-launch-video seeded from the vendored copy into ~/.claude/skills (skills re-scanned)"
    fi
  fi
fi

ENV_NOTE="env not persisted (CLAUDE_ENV_FILE unset)"
if [[ -n "${CLAUDE_ENV_FILE:-}" ]]; then
  if run_capped 20 node "$TOOLCHAIN_MJS" env --privacy "$PRIVACY" >>"$CLAUDE_ENV_FILE" 2>>"$PLUGIN_DATA/hook.log"; then
    ENV_NOTE="env exported to later Bash commands (POWER_PRESENTATION_DATA, toolchain PATH, HYPERFRAMES_SKIP_SKILLS=1"
    [[ "$PRIVACY" == "local" ]] && ENV_NOTE="$ENV_NOTE, HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1 HYPERFRAMES_NO_UPDATE_CHECK=1"
    ENV_NOTE="$ENV_NOTE)"
  else
    ENV_NOTE="env export failed (see $PLUGIN_DATA/hook.log)"
  fi
fi

INSTALL_NOTE=""
if [[ $STATUS_RC -ne 0 ]]; then
  if [[ "${POWER_PRESENTATION_NO_AUTO_INSTALL:-0}" == "1" ]]; then
    INSTALL_NOTE="auto-install off (POWER_PRESENTATION_NO_AUTO_INSTALL=1) — run \`node $TOOLCHAIN_MJS install\` yourself"
  elif [[ "$PRIVACY" == "local" ]]; then
    INSTALL_NOTE="privacy=local: no automatic download — show the user \`node $TOOLCHAIN_MJS manifest\` and, once confirmed, run \`node $TOOLCHAIN_MJS install --confirm-network\`"
  else
    INSTALL_NOTE="the async SessionStart installer is fetching the toolchain now (log: $PLUGIN_DATA/toolchain/install.log; ~1 GB) — check \`node $TOOLCHAIN_MJS status\` before capture or render"
  fi
fi
if [[ "$SOURCE" == "resume" && "$PRIVACY" != "local" ]]; then
  log "upgrade --check on resume is not run by the hook (network); the doctor report carries the CLI's update notice"
fi

RETENTION_NOTE=""
PROJECT_CWD="$(json_get .cwd)"; PROJECT_CWD="${PROJECT_CWD:-$PWD}"
RETENTION_MJS="$PLUGIN_ROOT/scripts/prospect-retention.mjs"
for RET_PROJECT in "$PROJECT_CWD" "$PROJECT_CWD"/power-presentation-out/*/; do
  RET_PROJECT="${RET_PROJECT%/}"
  [[ -f "$RET_PROJECT/.hyperframes/prospect-retention.json" && -f "$RETENTION_MJS" ]] || continue
  RET_RC=0
  RET_LINE="$(run_capped 10 node "$RETENTION_MJS" status --project "$RET_PROJECT" 2>>"$PLUGIN_DATA/hook.log")" || RET_RC=$?
  if [[ $RET_RC -eq 3 ]]; then
    if [[ "${POWER_PRESENTATION_HOOKS_ENFORCE:-0}" == "1" ]]; then
      RETENTION_NOTE="${RETENTION_NOTE:+$RETENTION_NOTE; }$(run_capped 20 node "$RETENTION_MJS" purge --project "$RET_PROJECT" 2>&1 | tail -1)"
    else
      RETENTION_NOTE="${RETENTION_NOTE:+$RETENTION_NOTE; }the sales prospect's data in $RET_PROJECT is past its 30 days — tell the user and, with their go-ahead, run \`node $RETENTION_MJS purge --project $RET_PROJECT\` ($RET_LINE)"
    fi
  fi
done

LINE="power-presentation $PLUGIN_VERSION (session $SOURCE, privacy=$PRIVACY, data $PLUGIN_DATA): $STATUS_LINE. ${ENV_NOTE}.${INSTALL_NOTE:+ $INSTALL_NOTE.}${SEED_NOTE:+ $SEED_NOTE.}${RETENTION_NOTE:+ $RETENTION_NOTE.}"

if [[ $RELOAD_SKILLS -eq 1 ]]; then
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":%s,"reloadSkills":true}}\n' "$(json_string "$LINE")"
else
  printf '%s\n' "$LINE"
fi
exit 0
