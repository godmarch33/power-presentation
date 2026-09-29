
project_root() {
  local cmd="$1" cwd="$2" cand=""
  local re_cd='^[[:space:]]*cd[[:space:]]+("([^"]+)"|([^[:space:];&|]+))[[:space:]]*(&&|;)'
  local re_render='hyperframes(@[^[:space:]]+)?[[:space:]]+render[[:space:]]+("([^"]+)"|([^-[:space:]][^[:space:];&|]*))'
  local re_project='--project[[:space:]=]+("([^"]+)"|([^[:space:];&|]+))'
  local re
  for re in "$re_cd" "$re_render" "$re_project"; do
    [[ "$cmd" =~ $re ]] || continue
    if [[ "$re" == "$re_cd" || "$re" == "$re_project" ]]; then cand="${BASH_REMATCH[2]}${BASH_REMATCH[3]}"
    else cand="${BASH_REMATCH[3]}${BASH_REMATCH[4]}"; fi
    [[ "$cand" == "~/"* ]] && cand="$HOME/${cand#\~/}"
    [[ "$cand" == /* ]] || cand="$cwd/$cand"
    if [[ -d "$cand" ]]; then (cd "$cand" && pwd); return 0; fi
  done
  printf '%s\n' "$cwd"
}
