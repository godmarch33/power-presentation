#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FFMPEG="${HYPERFRAMES_FFMPEG_PATH:-ffmpeg}"
FFPROBE="${HYPERFRAMES_FFPROBE_PATH:-ffprobe}"

usage() {
  cat <<'USAGE'
Usage: scripts/poster-bake.sh --video <mp4> [--poster <png|jpg>] [--at <sec>] [--storyboard STORYBOARD.md]
                              [--out <mp4>] [--poster-out <png>] [--keep-original] [--json]
       scripts/poster-bake.sh --help

Picks the poster (strongest settled frame) and bakes it into frame 0 of the delivered mp4 with an ffmpeg
overlay. Every other frame, the timing and the audio stay untouched (-c:a copy).
Poster source: --poster > --at > --storyboard (wowprobe --poster-pick) > edge-energy scan of the first 40 %.
Exit codes: 0 ok, 1 runtime failure, 2 usage.
USAGE
}

die() { echo "poster-bake: $*" >&2; exit 1; }
usage_err() { echo "poster-bake: $*" >&2; usage >&2; exit 2; }

VIDEO=""; POSTER=""; AT=""; STORYBOARD=""; OUT=""; POSTER_OUT=""; KEEP=0; JSON=0
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --video) VIDEO="${2:-}"; shift 2 ;;
    --poster) POSTER="${2:-}"; shift 2 ;;
    --at) AT="${2:-}"; shift 2 ;;
    --storyboard) STORYBOARD="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    --poster-out) POSTER_OUT="${2:-}"; shift 2 ;;
    --keep-original) KEEP=1; shift ;;
    --json) JSON=1; shift ;;
    *) usage_err "unknown argument: $1" ;;
  esac
done

[ -n "$VIDEO" ] || usage_err "--video is required"
if [ -n "$AT" ] && ! [[ "$AT" =~ ^[0-9]+([.][0-9]+)?$ ]]; then usage_err "--at must be seconds (got '$AT')"; fi
[ -f "$VIDEO" ] || die "video not found: $VIDEO"
command -v "$FFMPEG" >/dev/null 2>&1 || die "$FFMPEG not on PATH (the toolchain exports HYPERFRAMES_FFMPEG_PATH when it installed a static build)"
command -v "$FFPROBE" >/dev/null 2>&1 || die "$FFPROBE not on PATH"
if [ -n "$POSTER" ] && [ ! -f "$POSTER" ]; then die "poster image not found: $POSTER"; fi
if [ -n "$STORYBOARD" ] && [ ! -f "$STORYBOARD" ]; then die "storyboard not found: $STORYBOARD"; fi

dir="$(cd "$(dirname "$VIDEO")" && pwd)"
base="$(basename "$VIDEO")"
stem="${base%.*}"
[ -n "$OUT" ] || OUT="$dir/$base"
[ -n "$POSTER_OUT" ] || POSTER_OUT="$dir/$stem.poster.png"
POSTER_JPG="${POSTER_OUT%.*}.jpg"

probe() {
  "$FFPROBE" -v error -select_streams v:0 -show_entries "stream=width,height,nb_frames,r_frame_rate:format=duration" -of default=noprint_wrappers=1 "$1"
}
before="$(probe "$VIDEO")"
width="$(printf '%s\n' "$before" | sed -n 's/^width=//p' | head -1)"
height="$(printf '%s\n' "$before" | sed -n 's/^height=//p' | head -1)"
frames_before="$(printf '%s\n' "$before" | sed -n 's/^nb_frames=//p' | head -1)"
duration_before="$(printf '%s\n' "$before" | sed -n 's/^duration=//p' | head -1)"
[ -n "$width" ] && [ -n "$height" ] || die "no video stream in $VIDEO"
if [ -z "$frames_before" ] || [ "$frames_before" = "N/A" ]; then
  frames_before="$("$FFPROBE" -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of default=noprint_wrappers=1:nokey=1 "$VIDEO")"
fi

why=""
if [ -n "$POSTER" ]; then
  why="explicit --poster"
  AT=""
elif [ -n "$AT" ]; then
  why="explicit --at"
elif [ -n "$STORYBOARD" ]; then
  command -v python3 >/dev/null 2>&1 || die "python3 is needed for --storyboard (wowprobe.py --poster-pick)"
  pick="$(python3 "$here/wowprobe.py" --poster-pick --storyboard "$STORYBOARD")" || die "wowprobe --poster-pick failed"
  AT="$(printf '%s' "$pick" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("" if d.get("t") is None else d["t"])')"
  why="$(printf '%s' "$pick" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("why",""))')"
  [ -n "$AT" ] || die "the storyboard yields no poster moment ($why) — pass --at or --poster"
  why="storyboard: $why"
fi
if [ -z "$POSTER" ] && [ -z "$AT" ]; then
  window="$(awk -v d="$duration_before" 'BEGIN { w = d * 0.4; if (w < 1) w = 1; printf "%.3f", w }')"
  luma="$("$FFMPEG" -nostdin -hide_banner -loglevel error -t "$window" -i "$VIDEO" -vf "fps=2,scale=480:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -an -f null - 2>/dev/null | awk '/pts_time:/ { sub(/.*pts_time:/, ""); t=$1 } /YAVG=/ { sub(/.*=/, ""); print t, $1 }')"
  edges="$("$FFMPEG" -nostdin -hide_banner -loglevel error -t "$window" -i "$VIDEO" -vf "fps=2,scale=480:-2,sobel,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -an -f null - 2>/dev/null | awk '/pts_time:/ { sub(/.*pts_time:/, ""); t=$1 } /YAVG=/ { sub(/.*=/, ""); print t, $1 }')"
  AT="$(awk 'NR==FNR { luma[$1]=$2; next } { if (luma[$1] >= 40 && $2 > best) { best=$2; t=$1 } } END { if (t == "") t = 1.0; printf "%.3f", t }' <(printf '%s\n' "$luma") <(printf '%s\n' "$edges"))"
  why="edge-energy scan of the first ${window} s"
fi

mkdir -p "$(dirname "$POSTER_OUT")"
if [ -n "$POSTER" ]; then
  "$FFMPEG" -nostdin -hide_banner -loglevel error -y -i "$POSTER" -frames:v 1 -vf "scale=${width}:${height}:flags=lanczos,format=rgb24" "$POSTER_OUT" || die "could not read poster image $POSTER"
else
  AT="$(awk -v t="$AT" -v d="$duration_before" 'BEGIN { if (t > d - 0.05) t = d - 0.05; if (t < 0) t = 0; printf "%.3f", t }')"
  "$FFMPEG" -nostdin -hide_banner -loglevel error -y -ss "$AT" -i "$VIDEO" -frames:v 1 -vf "format=rgb24" "$POSTER_OUT" || die "could not extract the poster frame at ${AT}s"
fi
"$FFMPEG" -nostdin -hide_banner -loglevel error -y -i "$POSTER_OUT" -q:v 2 "$POSTER_JPG" || die "could not write $POSTER_JPG"

tmp="$(mktemp "$dir/.$stem.poster.XXXXXX.mp4")"
trap 'rm -f "$tmp"' EXIT
"$FFMPEG" -nostdin -hide_banner -loglevel error -y -i "$VIDEO" -i "$POSTER_OUT" \
  -filter_complex "[1:v]scale=${width}:${height}[p];[0:v][p]overlay=0:0:enable='eq(n,0)'[v]" \
  -map "[v]" -map "0:a?" -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p \
  -c:a copy -movflags +faststart "$tmp" || die "ffmpeg overlay failed"

after="$(probe "$tmp")"
frames_after="$(printf '%s\n' "$after" | sed -n 's/^nb_frames=//p' | head -1)"
duration_after="$(printf '%s\n' "$after" | sed -n 's/^duration=//p' | head -1)"
if [ -z "$frames_after" ] || [ "$frames_after" = "N/A" ]; then
  frames_after="$("$FFPROBE" -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of default=noprint_wrappers=1:nokey=1 "$tmp")"
fi
[ "$frames_before" = "$frames_after" ] || die "bake changed the frame count ($frames_before → $frames_after); output discarded"
if ! awk -v a="$duration_before" -v b="$duration_after" 'BEGIN { d = a - b; if (d < 0) d = -d; exit !(d <= 0.05) }'; then
  die "bake changed the duration ($duration_before → $duration_after); output discarded"
fi

if [ "$KEEP" = 1 ] && [ "$(readlink -f "$OUT")" = "$(readlink -f "$VIDEO")" ]; then
  cp -p "$VIDEO" "$dir/$stem.pre-poster.mp4"
fi
mkdir -p "$(dirname "$OUT")"
chmod --reference="$VIDEO" "$tmp" 2>/dev/null || chmod 644 "$tmp"
mv -f "$tmp" "$OUT"
trap - EXIT

if [ "$JSON" = 1 ]; then
  python3 - "$VIDEO" "$OUT" "$POSTER_OUT" "$POSTER_JPG" "${AT:-}" "$why" "$frames_before" "$frames_after" "$duration_before" "$duration_after" <<'PY' 2>/dev/null || \
  printf '{"video":"%s","out":"%s","poster_png":"%s","poster_jpg":"%s","at":%s,"why":"%s","frames_before":%s,"frames_after":%s}\n' \
    "$VIDEO" "$OUT" "$POSTER_OUT" "$POSTER_JPG" "${AT:-null}" "$why" "$frames_before" "$frames_after"
import json, sys
v = sys.argv[1:]
print(json.dumps({"video": v[0], "out": v[1], "poster_png": v[2], "poster_jpg": v[3], "at": (None if v[4] == "" else float(v[4])), "why": v[5],
                  "frames_before": int(v[6]), "frames_after": int(v[7]), "duration_before": float(v[8]), "duration_after": float(v[9])}))
PY
else
  echo "poster-bake: poster ${why}${AT:+ at ${AT}s} → $POSTER_OUT (+ .jpg); frame 0 baked into $OUT ($frames_after frames, ${duration_after}s)"
fi
