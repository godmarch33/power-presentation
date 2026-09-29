#!/usr/bin/env bash
set -euo pipefail
file="${1:-$(dirname "$0")/labels.json}"
existing="$(gh label list --limit 500 --json name --jq '.[].name')"
jq -c '.[]' "$file" | while read -r label; do
  name="$(jq -r '.name' <<<"$label")"
  color="$(jq -r '.color' <<<"$label")"
  desc="$(jq -r '.description' <<<"$label")"
  if ! grep -Fxq "$name" <<<"$existing"; then
    while read -r alias; do
      if [ -n "$alias" ] && grep -Fxq "$alias" <<<"$existing"; then
        gh label edit "$alias" --name "$name" --color "$color" --description "$desc" </dev/null && echo "renamed: $alias -> $name"
        existing="$(printf '%s\n%s' "$existing" "$name")"
        break
      fi
    done < <(jq -r '.aliases // [] | .[]' <<<"$label")
  fi
  gh label create "$name" --color "$color" --description "$desc" --force </dev/null >/dev/null && echo "ok: $name"
done
