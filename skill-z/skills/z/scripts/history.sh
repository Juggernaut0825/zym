#!/usr/bin/env bash
# history.sh — 查看历史记录
# Usage: bash scripts/history.sh [days]
# days: 查看最近几天的记录，默认 7

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="$PROJECT_DIR/data/$USER_ID"

DAYS="${1:-7}"

python3 - "$DATA_DIR" "$DAYS" << 'PY'
import sys, os, json
from datetime import date, timedelta

data_dir = sys.argv[1]
days = int(sys.argv[2]) if len(sys.argv) > 2 else 7

# 加载每日记录
log_path = os.path.join(data_dir, "daily.json")
logs = json.load(open(log_path)) if os.path.exists(log_path) else {}

# 加载用户档案
prof_path = os.path.join(data_dir, "profile.json")
profile = json.load(open(prof_path)) if os.path.exists(prof_path) else {}
daily_target = profile.get("daily_target", 0)

print(f"=== 最近 {days} 天历史 ===")
print()

has_data = False
for i in range(days):
    d = (date.today() - timedelta(days=i)).isoformat()
    if d in logs:
        has_data = True
        day = logs[d]
        intake = day.get("total_intake", 0)
        burned = day.get("total_burned", 0)
        meals = len(day.get("meals", []))
        training = len(day.get("training", []))
        weight = day.get("weight_kg")

        line = f"{d}: 摄入 {intake} kcal | 消耗 {burned} kcal | 餐 {meals} | 训练 {training}"
        if weight:
            line += f" | 体重 {weight}kg"
        if daily_target:
            diff = intake - burned - daily_target
            if diff > 0:
                line += f" | 超{diff}"
            else:
                line += f" | 余{abs(diff)}"
        print(line)

if not has_data:
    print("没有历史记录")
PY
