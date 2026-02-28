#!/usr/bin/env bash
# get-profile.sh — 获取用户档案
# Usage: bash scripts/get-profile.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="$PROJECT_DIR/data/$USER_ID"

python3 - "$DATA_DIR" << 'PY'
import sys, os, json

data_dir = sys.argv[1]
prof_path = os.path.join(data_dir, "profile.json")

if not os.path.exists(prof_path):
    print("用户档案尚未创建。")
    print("请先设置基础信息，例如：")
    print('  bash scripts/set-profile.sh \'{"height_cm":175,"weight_kg":70,"age":25,"gender":"male"}\'')
    sys.exit(0)

profile = json.load(open(prof_path))

print("=== 用户档案 ===")
print(f"身高: {profile.get('height_cm', '?')} cm")
print(f"体重: {profile.get('weight_kg', '?')} kg")
print(f"年龄: {profile.get('age', '?')} 岁")
print(f"性别: {profile.get('gender', '?')}")
if profile.get('body_fat_pct'):
    print(f"体脂: {profile['body_fat_pct']}%")
if profile.get('activity_level'):
    print(f"活动水平: {profile['activity_level']}")
print()
print(f"BMR: {profile.get('bmr', '?')} kcal/day")
print(f"TDEE: {profile.get('tdee', '?')} kcal/day")
print(f"目标: {profile.get('goal', '未设置')}")
print(f"每日目标: {profile.get('daily_target', '?')} kcal")
if profile.get('notes'):
    print(f"备注: {profile['notes']}")
PY
