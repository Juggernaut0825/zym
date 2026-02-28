#!/usr/bin/env bash
# summary.sh — 获取今日或本周汇总
# Usage: bash scripts/summary.sh [today|week]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="$PROJECT_DIR/data/$USER_ID"

PERIOD="${1:-today}"

python3 - "$DATA_DIR" "$PERIOD" << 'PY'
import sys, os, json
from datetime import date, timedelta

data_dir = sys.argv[1]
period = sys.argv[2] if len(sys.argv) > 2 else "today"

# 加载用户档案
prof_path = os.path.join(data_dir, "profile.json")
profile = json.load(open(prof_path)) if os.path.exists(prof_path) else {}
daily_target = profile.get("daily_target", 0)
goal = profile.get("goal", "未设置")
tdee = profile.get("tdee", 0)

# 加载每日记录
log_path = os.path.join(data_dir, "daily.json")
logs = json.load(open(log_path)) if os.path.exists(log_path) else {}

if period == "today":
    target_date = date.today().isoformat()

    print(f"=== {target_date} 汇总 ===")
    print(f"目标: {goal} | 每日目标: {daily_target} kcal | TDEE: {tdee}")
    print()

    if target_date not in logs:
        print("今天还没有记录")
        sys.exit(0)

    day = logs[target_date]
    meals = day.get("meals", [])
    training = day.get("training", [])

    intake = day.get("total_intake", 0)
    burned = day.get("total_burned", 0)
    net = intake - burned

    # 计算总宏量
    protein = sum(m.get("protein_g", 0) for m in meals)
    carbs = sum(m.get("carbs_g", 0) for m in meals)
    fat = sum(m.get("fat_g", 0) for m in meals)

    print(f"餐数: {len(meals)} | 训练: {len(training)}")
    print()
    print(f"摄入: {intake} kcal")
    print(f"消耗: {burned} kcal")
    print(f"净值: {net} kcal")

    if daily_target:
        remaining = daily_target - net
        print()
        if remaining > 0:
            print(f"还可摄入: ~{remaining} kcal")
        else:
            print(f"已超目标: {abs(remaining)} kcal")

    print()
    print(f"宏量: P {protein}g | C {carbs}g | F {fat}g")

elif period == "week":
    print("=== 本周汇总 ===")
    print(f"目标: {goal} | 每日目标: {daily_target} kcal")
    print()

    total_intake = 0
    total_burned = 0
    days_with_data = 0

    for i in range(7):
        d = (date.today() - timedelta(days=i)).isoformat()
        if d in logs:
            days_with_data += 1
            day = logs[d]
            intake = day.get("total_intake", 0)
            burned = day.get("total_burned", 0)
            total_intake += intake
            total_burned += burned

            meals = len(day.get("meals", []))
            train = len(day.get("training", []))
            print(f"  {d}: 摄入 {intake} kcal | 消耗 {burned} kcal | 餐 {meals} | 训练 {train}")

    if days_with_data == 0:
        print("本周还没有记录")
    else:
        print()
        avg_intake = round(total_intake / days_with_data)
        avg_burned = round(total_burned / days_with_data)
        print(f"记录天数: {days_with_data}/7")
        print(f"平均摄入: {avg_intake} kcal/天")
        print(f"平均消耗: {avg_burned} kcal/天")
        print(f"周净值: {total_intake - total_burned} kcal")

else:
    print(f"未知周期: {period}，请使用 today 或 week")
PY
