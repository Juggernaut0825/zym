#!/usr/bin/env bash
# get-daily-intake.sh — 获取每日摄入情况
# Usage: bash scripts/get-daily-intake.sh [date]
# date 格式: YYYY-MM-DD，默认今天

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="$PROJECT_DIR/data/$USER_ID"

DATE="${1:-}"

python3 - "$DATA_DIR" "$DATE" << 'PY'
import sys, os, json
from datetime import date

data_dir = sys.argv[1]
date_arg = sys.argv[2] if len(sys.argv) > 2 else None

target_date = date_arg if date_arg else date.today().isoformat()

# 加载每日记录
log_path = os.path.join(data_dir, "daily.json")
logs = json.load(open(log_path)) if os.path.exists(log_path) else {}

if target_date not in logs:
    print(f"日期 {target_date} 没有饮食记录")
    sys.exit(0)

day = logs[target_date]
meals = day.get("meals", [])

print(f"=== {target_date} 摄入情况 ===")
print(f"记录餐数: {len(meals)}")
print()

total_cal = 0
total_protein = 0
total_carbs = 0
total_fat = 0

for i, meal in enumerate(meals, 1):
    cal = meal.get("calories", 0)
    p = meal.get("protein_g", 0)
    c = meal.get("carbs_g", 0)
    f = meal.get("fat_g", 0)
    desc = meal.get("description", "?")
    time = meal.get("time", "?")

    print(f"{i}. [{time}] {desc}")
    print(f"   {cal} kcal | P:{p}g C:{c}g F:{f}g")

    total_cal += cal
    total_protein += p
    total_carbs += c
    total_fat += f

# 加载用户目标
prof_path = os.path.join(data_dir, "profile.json")
profile = json.load(open(prof_path)) if os.path.exists(prof_path) else {}
daily_target = profile.get("daily_target", 0)

print()
print(f"=== 汇总 ===")
print(f"总摄入: {total_cal} kcal")
print(f"蛋白质: {total_protein}g | 碳水: {total_carbs}g | 脂肪: {total_fat}g")

if daily_target:
    remaining = daily_target - total_cal
    print(f"每日目标: {daily_target} kcal")
    if remaining > 0:
        print(f"还可摄入: {remaining} kcal")
    else:
        print(f"已超目标: {abs(remaining)} kcal")
PY
