#!/usr/bin/env bash
set -euo pipefail

HOOK_NAME="power-presentation/guard-render"
ENFORCE="${POWER_PRESENTATION_HOOKS_ENFORCE:-0}"
INPUT="$(cat 2>/dev/null || true)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-${POWER_PRESENTATION_DATA:-$HOME/.claude/plugins/data/power-presentation}}"

log() { printf '%s: %s\n' "$HOOK_NAME" "$*" >&2; }

HAVE_JSON=1
if ! command -v jq >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
  HAVE_JSON=0
fi

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
  local file="$1" path="$2"
  [[ -f "$file" ]] || return 0
  if command -v jq >/dev/null 2>&1; then
    jq -r "$path | if . == null then empty elif type == \"string\" then . else tojson end" "$file" 2>/dev/null || true
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c '
import json, sys
path = [p for p in sys.argv[2].split(".") if p]
try:
    obj = json.load(open(sys.argv[1]))
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
' "$file" "$path" 2>/dev/null || true
  fi
}

json_file_list() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  if command -v jq >/dev/null 2>&1; then
    jq -r ".${key}[]? | strings" "$file" 2>/dev/null || true
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c '
import json, sys
try:
    arr = json.load(open(sys.argv[1])).get(sys.argv[2], [])
except Exception:
    sys.exit(0)
for x in arr if isinstance(arr, list) else []:
    if isinstance(x, str):
        sys.stdout.write(x + "\n")
' "$file" "$key" 2>/dev/null || true
  fi
}

doctor_failed_names() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  if command -v jq >/dev/null 2>&1; then
    jq -r '.gate.failed[]?.name // empty' "$file" 2>/dev/null || true
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c '
import json, sys
try:
    for x in json.load(open(sys.argv[1])).get("gate", {}).get("failed", []):
        if isinstance(x, dict) and isinstance(x.get("name"), str):
            sys.stdout.write(x["name"] + "\n")
except Exception:
    pass
' "$file" 2>/dev/null || true
  fi
}

emit_deny() {
  local reason="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -nc --arg r "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys; print(json.dumps({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":sys.argv[1]}}))' "$reason"
  else
    reason="${reason//\\/\\\\}"; reason="${reason//\"/\\\"}"
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$reason"
  fi
}

if [[ $HAVE_JSON -eq 1 ]]; then
  CMD="$(json_get .tool_input.command)"
else
  CMD="$INPUT"
fi
[[ -n "$CMD" ]] || exit 0
RENDER_RE='hyperframes(@[^[:space:]]+)?[[:space:]]+render([[:space:]]|$)'
[[ "$CMD" =~ $RENDER_RE ]] || exit 0
case "$CMD" in *--help*|*" -h"*) exit 0 ;; esac

if [[ $HAVE_JSON -eq 0 ]]; then
  if [[ "$ENFORCE" == "1" ]]; then
    emit_deny "power-presentation guard-render: cannot evaluate the render gates because neither jq nor python3 is available to read the hook input. Install one of them or unset POWER_PRESENTATION_HOOKS_ENFORCE."
  else
    log "dry-run: render detected but no jq/python3 to evaluate gates"
  fi
  exit 0
fi

SESSION_CWD="$(json_get .cwd)"
[[ -n "$SESSION_CWD" && -d "$SESSION_CWD" ]] || SESSION_CWD="$PWD"
source "$SCRIPT_DIR/project-root.sh"
ROOT="$(project_root "$CMD" "$SESSION_CWD")"
cd "$ROOT"

FAILS=()

CHECK_FILE="QA/check.json"
if [[ ! -f "$CHECK_FILE" ]]; then
  FAILS+=("QA-02: $CHECK_FILE missing — run \`hyperframes check --json --frame-check\` and save it there (the present-qa skill does this) before rendering")
else
  CHECK_OK="$(json_file_get "$CHECK_FILE" .ok)"
  if [[ "$CHECK_OK" != "true" ]]; then
    FAILS+=("QA-02: $CHECK_FILE has ok=${CHECK_OK:-absent}; triage the errors (a data-layout-allow-* waiver must cite a snapshot in QA.md) and re-run check")
  fi
fi

SB="STORYBOARD.md"
if [[ ! -f "$SB" ]]; then
  FAILS+=("storyboard-approved: $SB missing — no approved storyboard, nothing to render")
elif ! grep -qE '^[[:space:]]*(-[[:space:]]*)?approved:[[:space:]]*v[0-9]+' "$SB"; then
  FAILS+=("storyboard-approved: $SB has no \`approved: v<N>\` line — the human review step (storyboard → snapshot → one-scene look → \"render?\") has not recorded an approval")
fi

SCOPE_FILE="renders/edit-scope.json"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  FAILS+=("edit-scope: $ROOT is not a git repository — versioning (\`v<N>: <request>\` commits, renders/manifest.json) requires git")
else
  CHANGED="$( { git diff --name-only HEAD 2>/dev/null || git diff --name-only 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null; } | sed '/^$/d' | sort -u || true)"
  CHANGED="$(printf '%s\n' "$CHANGED" | grep -Ev '^(renders/edit-scope\.json|\.hyperframes/pp-stages\.json|\.hyperframes/progress\.json(\.[0-9]+\.tmp)?|\.hyperframes/tokens\.json|\.media/egress\.jsonl)$' | sed '/^$/d' || true)"
  if [[ -n "$CHANGED" ]]; then
    if [[ ! -f "$SCOPE_FILE" ]]; then
      FAILS+=("edit-scope: working tree has uncommitted changes but $SCOPE_FILE declares no edit scope — either commit \`v<N>: <request>\` or declare {\"version\":\"v<N>\",\"files\":[...]} first. Changed: $(printf '%s' "$CHANGED" | tr '\n' ' ')")
    else
      DECLARED="$(json_file_list "$SCOPE_FILE" files | sort -u)"
      OUTSIDE=""
      while IFS= read -r f; do
        [[ -n "$f" ]] || continue
        [[ "$f" == "$SCOPE_FILE" ]] && continue
        if ! printf '%s\n' "$DECLARED" | grep -Fxq -- "$f"; then
          OUTSIDE="${OUTSIDE:+$OUTSIDE }$f"
        fi
      done <<<"$CHANGED"
      if [[ -n "$OUTSIDE" ]]; then
        FAILS+=("edit-scope: git diff is wider than the declared set in $SCOPE_FILE. Outside scope: $OUTSIDE. The model edits one named artifact per step; global consequences are computed by scripts (assemble/transitions/captions)")
      fi
    fi
  fi
fi

while IFS= read -r mf; do
  [[ -n "$mf" ]] || continue
  mf="${mf#./}"
  BLOCKED="$(json_file_get "$mf" .blocked)"
  GATE_RAN="$(json_file_get "$mf" .redaction.layer2_ocr_gate.ran)"
  GATE_CONFIRMED="$(json_file_get "$mf" .redaction.layer2_ocr_gate.confirmed)"
  GATE_FINDINGS="$(json_file_get "$mf" .redaction.layer2_ocr_gate.findings)"
  GATE_REASON="$(json_file_get "$mf" .redaction.layer2_ocr_gate.reason)"
  if [[ "$BLOCKED" == "true" ]]; then
    FAILS+=("capture-clean: $mf is blocked — ${GATE_FINDINGS:-?} potential secret/PII match(es) in the captured frames. Review $(dirname "$mf")/redaction-findings.json with the user, then re-run record-flow with --confirm-findings (never --skip-ocr-gate)")
  elif [[ "$GATE_RAN" != "true" && "$GATE_CONFIRMED" != "true" ]]; then
    FAILS+=("capture-clean: $mf — the Layer-2 OCR gate did not run (${GATE_REASON:-no reason recorded}), so the footage is unscanned. Install tesseract and re-run record-flow, or re-run it with --confirm-findings to accept unscanned footage knowingly")
  fi
done < <(find . -maxdepth 4 -name capture-manifest.json -not -path '*/node_modules/*' -not -path './.git/*' 2>/dev/null | sort)

DOCTOR_FILE="$PLUGIN_DATA/doctor.json"
PIN="$(grep -oE "HYPERFRAMES_PIN[[:space:]]*=[[:space:]]*['\"][^'\"]+['\"]" "$PLUGIN_ROOT/scripts/lib/versions.mjs" 2>/dev/null | head -1 | sed -E "s/.*['\"]([^'\"]+)['\"]/\1/" || true)"
PIN="${PIN:-0.8.47}"
FIX_CMD="node $PLUGIN_ROOT/scripts/toolchain.mjs doctor"
if [[ ! -f "$DOCTOR_FILE" ]]; then
  FAILS+=("toolchain-ready: no doctor report at $DOCTOR_FILE — the toolchain has not been checked; run \`$FIX_CMD\` (or \`node $PLUGIN_ROOT/scripts/toolchain.mjs install\` when the toolchain is missing)")
else
  DOCTOR_OK="$(json_file_get "$DOCTOR_FILE" .gate.ok)"
  DOCTOR_HF="$(json_file_get "$DOCTOR_FILE" .hyperframes)"
  if [[ "$DOCTOR_HF" != "$PIN" ]]; then
    FAILS+=("toolchain-ready: $DOCTOR_FILE was produced by hyperframes ${DOCTOR_HF:-?}, not the pinned $PIN — re-run \`$FIX_CMD\`")
  elif [[ "$DOCTOR_OK" != "true" ]]; then
    DOCTOR_FAILED="$(doctor_failed_names "$DOCTOR_FILE" | tr '\n' ' ' | sed 's/ $//' || true)"
    FAILS+=("toolchain-ready: doctor gate failed (${DOCTOR_FAILED:-see $DOCTOR_FILE}) — fix the toolchain and re-run \`$FIX_CMD\`")
  fi
fi

if [[ ${#FAILS[@]} -eq 0 ]]; then
  log "gates pass (QA-02 check ok, approved storyboard, diff within scope, captures clean, toolchain ready) for: $CMD"
  exit 0
fi

REASON="power-presentation guard-render refused \`hyperframes render\` (${#FAILS[@]} gate(s) failed): "
for f in "${FAILS[@]}"; do REASON="$REASON [$f]"; done

if [[ "$ENFORCE" == "1" ]]; then
  emit_deny "$REASON"
  log "DENY: $REASON"
else
  log "dry-run: would DENY (set POWER_PRESENTATION_HOOKS_ENFORCE=1 to enforce): $REASON"
fi
exit 0
