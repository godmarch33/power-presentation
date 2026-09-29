#!/usr/bin/env bash
set -euo pipefail

HOOK_NAME="power-presentation/toolchain-install"
cat >/dev/null 2>&1 || true

log() { printf '%s: %s\n' "$HOOK_NAME" "$*" >&2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-${POWER_PRESENTATION_DATA:-$HOME/.claude/plugins/data/power-presentation}}"
export CLAUDE_PLUGIN_DATA="$PLUGIN_DATA"
PRIVACY="${POWER_PRESENTATION_PRIVACY:-${CLAUDE_PLUGIN_OPTION_PRIVACY:-default}}"
[[ "$PRIVACY" == "local" ]] || PRIVACY="default"

emit() {
  local text="$1" json
  if command -v jq >/dev/null 2>&1; then json="$(printf '%s' "$text" | jq -Rs .)"
  elif command -v python3 >/dev/null 2>&1; then json="$(python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' <<<"$text")"
  else text="${text//\\/\\\\}"; text="${text//\"/\\\"}"; json="\"${text//$'\n'/\\n}\""; fi
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":%s}}\n' "$json"
}

if [[ "${POWER_PRESENTATION_NO_AUTO_INSTALL:-0}" == "1" ]]; then log "auto-install disabled (POWER_PRESENTATION_NO_AUTO_INSTALL=1)"; exit 0; fi
if [[ "$PRIVACY" == "local" ]]; then log "privacy=local: no automatic download (manifest confirmation first)"; exit 0; fi
if ! command -v node >/dev/null 2>&1; then log "node not found; nothing installed"; exit 0; fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [[ "${NODE_MAJOR:-0}" -lt 22 ]]; then log "node < 22; nothing installed"; exit 0; fi

mkdir -p "$PLUGIN_DATA" 2>/dev/null || true
RESULT="$(node "$PLUGIN_ROOT/scripts/toolchain.mjs" install --if-needed --quiet --json --privacy "$PRIVACY" 2>>"$PLUGIN_DATA/hook.log" || true)"
[[ -n "$RESULT" ]] || { emit "power-presentation toolchain install produced no result — see $PLUGIN_DATA/hook.log"; exit 0; }

field() {
  if command -v jq >/dev/null 2>&1; then printf '%s' "$RESULT" | jq -r ".$1 // empty" 2>/dev/null
  elif command -v python3 >/dev/null 2>&1; then printf '%s' "$RESULT" | python3 -c 'import json,sys; v=json.load(sys.stdin).get(sys.argv[1]); print("" if v is None else (str(v).lower() if isinstance(v,bool) else v))' "$1" 2>/dev/null
  fi
}
SKIPPED="$(field skipped)"; REFUSED="$(field refused)"; OK="$(field ok)"; SUMMARY="$(field summary)"; REASON="$(field reason)"; ERROR="$(field error)"
if [[ "$SKIPPED" == "true" ]]; then log "skipped: ${REASON:-already ready}"; exit 0; fi
if [[ "$REFUSED" == "true" ]]; then emit "power-presentation toolchain install refused: ${REASON}"; exit 0; fi
if [[ "$OK" == "true" ]]; then
  emit "power-presentation toolchain install finished: ${SUMMARY}. The exports for this session were written at session start; new Bash commands already see the toolchain."
else
  emit "power-presentation toolchain install FAILED: ${ERROR:-${SUMMARY:-unknown}} — log: $PLUGIN_DATA/toolchain/install.log; retry with \`node $PLUGIN_ROOT/scripts/toolchain.mjs install\`."
fi
exit 0
