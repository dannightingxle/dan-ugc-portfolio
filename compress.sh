#!/bin/bash
# Re-encode portfolio clips for the web:
#   - HEVC -> H.264 (HEVC is not reliably decodable outside Safari)
#   - CRF 27 instead of the 7-9 Mbps camera-original bitrates
#   - +faststart so the moov atom leads and playback can start streaming
# If an encode doesn't beat the original by 8%, keep the original bytes and
# only remux for faststart, so already-web-ready clips take no generation loss.
FF=node_modules/ffmpeg-static/ffmpeg
OUT=/tmp/compressed
mkdir -p "$OUT"
: > /tmp/compress-report.txt

for f in public/work/*.mp4; do
  n=$(basename "$f")
  in_size=$(stat -c%s "$f")
  "$FF" -hide_banner -loglevel error -i "$f" \
    -c:v libx264 -crf 27 -preset slow -pix_fmt yuv420p -profile:v high \
    -c:a aac -b:a 96k -movflags +faststart -y "$OUT/$n" 2>>/tmp/compress-err.txt
  out_size=$(stat -c%s "$OUT/$n" 2>/dev/null || echo 0)
  if [ "$out_size" -gt 0 ] && [ "$out_size" -lt $((in_size * 92 / 100)) ]; then
    verdict="reencoded"
  else
    # not worth the quality loss - just move the moov atom to the front
    "$FF" -hide_banner -loglevel error -i "$f" -c copy -movflags +faststart -y "$OUT/$n" 2>>/tmp/compress-err.txt
    out_size=$(stat -c%s "$OUT/$n")
    verdict="remux-only"
  fi
  printf "%-22s %7.1f -> %7.1f MB  (%3d%%)  %s\n" \
    "$n" "$(echo $in_size | awk '{print $1/1e6}')" "$(echo $out_size | awk '{print $1/1e6}')" \
    "$((out_size * 100 / in_size))" "$verdict" >> /tmp/compress-report.txt
done
echo DONE >> /tmp/compress-report.txt
