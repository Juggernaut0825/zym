#!/usr/bin/env bash
# set-goal.sh — 设置健身目标 (cut/bulk/maintain)
# Usage: bash scripts/set-goal.sh <cut|bulk|maintain>

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="$PROJECT_DIR/data/$USER_ID"

GOAL="${1:-}"
[ -z "$GOAL" ] && echo "Usage: set-goal.sh <cut|bulk|maintain>" && exit 1

mkdir -p "$DATA_DIR"

python3 - "$GOAL" "$DATA_DIR" << 'PY'
import sys, os, json

goal = sys.argv[1].lower()
data_dir = sys.argv[2]

if goal not in ("cut", "bulk", "maintain"):
    print("ERROR: goal must be cut, bulk, or maintain")
    sys.exit(1)

prof_path = os.path.join(data_dir, "profile.json")
profile = json.load(open(prof_path)) if os.path.exists(prof_path) else {}

tdee = profile.get("tdee")
if not tdee:
    print("ERROR: 需要先设置身体指标才能设定目标")
    print("请运行: bash scripts/set-profile.sh '{\"height_cm\":...,\"weight_kg\":...,\"age\":...,\"gender\":\"male|female\"}'")
    sys.exit(1)

if goal == "cut":
    target = round(tdee - 500)
    desc = f"减脂: {target} kcal/day (TDEE - 500)"
elif goal == "bulk":
    target = round(tdee + 300)
    desc = f"增肌: {target} kcal/day (TDEE + 300)"
else:
    target = tdee
    desc = f"维持: {target} kcal/day (= TDEE)"

profile["goal"] = goal
profile["daily_target"] = target

with open(prof_path, "w") as f:
    json.dump(profile, f, indent=2, ensure_ascii=False)

print(f"=== 目标已设置 ===")
print(f"目标类型: {desc}")
print(f"TDEE: {tdee} kcal/day")
print(f"每日热量目标: {target} kcal/day")
PY
