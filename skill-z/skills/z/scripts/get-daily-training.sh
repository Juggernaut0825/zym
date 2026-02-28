#!/usr/bin/env bash
# get-daily-training.sh — 获取每日训练情况
# Usage: bash scripts/get-daily-training.sh [date]
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
    print(f"日期 {target_date} 没有训练记录")
    sys.exit(0)

day = logs[target_date]
training = day.get("training", [])

print(f"=== {target_date} 训练情况 ===")
print(f"记录次数: {len(training)}")
print()

for i, session in enumerate(training, 1):
    sess_type = session.get("type", "exercise")
    time = session.get("time", "?")

    if sess_type == "form_check":
        # 视频分析记录
        exercise = session.get("exercise", "?")
        score = session.get("form_score", "?")
        issues = session.get("issues", [])
        print(f"{i}. [{time}] 动作分析: {exercise}")
        print(f"   评分: {score}/10")
        if issues:
            print(f"   问题: {', '.join(issues[:2])}")
    else:
        # 常规训练记录
        name = session.get("name", "?")
        sets = session.get("sets", "?")
        reps = session.get("reps", "?")
        weight = session.get("weight_kg", "?")
        volume = session.get("volume_kg", 0)
        notes = session.get("notes", "")

        print(f"{i}. [{time}] {name}")
        print(f"   {sets}x{reps} @ {weight}kg (容量: {volume:.1f}kg)")
        if notes:
            print(f"   备注: {notes}")

print()
print(f"=== 汇总 ===")
print(f"总消耗: {day.get('total_burned', 0)} kcal")
PY
