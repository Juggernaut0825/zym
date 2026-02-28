#!/usr/bin/env bash
# get-plan.sh — 获取训练计划
# Usage: bash scripts/get-plan.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="$PROJECT_DIR/data/$USER_ID"

python3 - "$DATA_DIR" << 'PY'
import sys, os, json

data_dir = sys.argv[1]
plan_path = os.path.join(data_dir, "training_plan.json")

if not os.path.exists(plan_path):
    print("还没有训练计划")
    print("使用 generate-plan.sh 来生成一个新的训练计划")
    sys.exit(0)

plan = json.load(open(plan_path))

print("=== 训练计划 ===")
print(f"计划名称: {plan.get('name', 'Custom Plan')}")
print(f"创建时间: {plan.get('created_at', '?')}")
print()

for day in plan.get("days", []):
    day_name = day.get("day", "?")
    exercises = day.get("exercises", [])
    notes = day.get("notes", "")

    print(f"【{day_name}】")
    for ex in exercises:
        name = ex.get("name", "?")
        sets = ex.get("sets", "?")
        reps = ex.get("reps", "?")
        rest = ex.get("rest", "")
        ex_notes = ex.get("notes", "")

        line = f"  - {name}: {sets}x{reps}"
        if rest:
            line += f" (休息 {rest})"
        print(line)
        if ex_notes:
            print(f"    备注: {ex_notes}")
    if notes:
        print(f"  > {notes}")
    print()
PY
