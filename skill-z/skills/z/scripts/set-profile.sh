#!/usr/bin/env bash
# set-profile.sh — 设置或更新用户档案
# Usage: bash scripts/set-profile.sh '<json>'
# 示例: bash scripts/set-profile.sh '{"height_cm":175,"weight_kg":70,"age":25,"gender":"male"}'

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="$PROJECT_DIR/data/$USER_ID"

JSON_INPUT="${1:-}"
[ -z "$JSON_INPUT" ] && echo "Usage: set-profile.sh '<json>'" && exit 1

mkdir -p "$DATA_DIR"

python3 - "$JSON_INPUT" "$DATA_DIR" << 'PY'
import sys, os, json

json_input = sys.argv[1]
data_dir = sys.argv[2]

try:
    updates = json.loads(json_input)
except json.JSONDecodeError as e:
    print(f"ERROR: Invalid JSON: {e}")
    sys.exit(1)

prof_path = os.path.join(data_dir, "profile.json")
profile = json.load(open(prof_path)) if os.path.exists(prof_path) else {}

# 更新字段
profile.update(updates)

# 如果提供了身体数据，重新计算 BMR 和 TDEE
h = profile.get("height_cm")
w = profile.get("weight_kg")
a = profile.get("age")
g = profile.get("gender", "male").lower()
bf = profile.get("body_fat_pct")
activity = profile.get("activity_level", "moderate")

if h and w and a:
    # BMR 计算
    if bf:
        lbm = w * (1 - bf / 100)
        bmr = round(370 + 21.6 * lbm)  # Katch-McArdle
    elif g == "male":
        bmr = round(10 * w + 6.25 * h - 5 * a + 5)  # Mifflin-St Jeor
    else:
        bmr = round(10 * w + 6.25 * h - 5 * a - 161)

    # TDEE 活动系数
    activity_multipliers = {
        "sedentary": 1.2,
        "light": 1.375,
        "moderate": 1.55,
        "active": 1.725,
        "very_active": 1.9,
    }
    tdee = round(bmr * activity_multipliers.get(activity, 1.55))

    profile["bmr"] = bmr
    profile["tdee"] = tdee

    # 如果有目标，更新每日目标
    goal = profile.get("goal", "maintain")
    if goal == "cut":
        profile["daily_target"] = round(tdee - 500)
    elif goal == "bulk":
        profile["daily_target"] = round(tdee + 300)
    else:
        profile["daily_target"] = tdee

with open(prof_path, "w") as f:
    json.dump(profile, f, indent=2, ensure_ascii=False)

print("=== 用户档案已更新 ===")
for key, value in profile.items():
    if value is not None:
        print(f"  {key}: {value}")
PY
