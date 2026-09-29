#!/usr/bin/env bash
set -uo pipefail

[ "${POWER_PRESENTATION_PROGRESS:-1}" = "0" ] && exit 0
INPUT="$(cat 2>/dev/null || true)"
case "$INPUT" in
  *power-presentation-out*) ;;
  *)
    SID="$(printf '%s' "${INPUT:0:4096}" | grep -o '"session_id" *: *"[A-Za-z0-9_-]*"' | head -n 1 | sed 's/.*"\([A-Za-z0-9_-]*\)"$/\1/')"
    [ -n "$SID" ] && [ -f "${CLAUDE_PLUGIN_DATA:-${TMPDIR:-/tmp}/power-presentation}/progress-sessions/$SID" ] || exit 0
    ;;
esac
command -v node >/dev/null 2>&1 || exit 0

ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
exec node "$ROOT/scripts/progress.mjs" --hook <<<"$INPUT" 2>/dev/null
