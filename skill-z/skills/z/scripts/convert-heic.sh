#!/usr/bin/env bash
# convert-heic.sh — 转换 HEIC 图片到 JPG
# Usage: bash scripts/convert-heic.sh <heic_path>

set -euo pipefail

FILE_PATH="${1:-}"
[ -z "$FILE_PATH" ] && echo "Usage: convert-heic.sh <heic_path>" && exit 1
[ ! -f "$FILE_PATH" ] && echo "ERROR: File not found: $FILE_PATH" && exit 1

EXT="${FILE_PATH##*.}"
if [[ "${EXT,,}" != "heic" ]]; then
    echo "WARNING: File extension is not .heic, attempting conversion anyway..."
fi

JPG_PATH="${FILE_PATH%.*}.jpg"

# 使用 sips (macOS) 或 ImageMagick
if command -v sips &> /dev/null; then
    sips -s format jpeg "$FILE_PATH" --out "$JPG_PATH" 2>/dev/null
elif command -v convert &> /dev/null; then
    convert "$FILE_PATH" "$JPG_PATH"
else
    echo "ERROR: 需要 sips (macOS) 或 ImageMagick 来转换 HEIC"
    exit 1
fi

echo "已转换: $JPG_PATH"
echo "$JPG_PATH"
