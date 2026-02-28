#!/usr/bin/env bash
# log-training.sh — 记录训练数据
# Usage: bash scripts/log-training.sh '<json_array>'
# 示例: bash scripts/log-training.sh '[{"name":"Back Squat","sets":4,"reps":"4","weight_kg":112.5}]'

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="$PROJECT_DIR/data/$USER_ID"

JSON_INPUT="${1:-}"
[ -z "$JSON_INPUT" ] && echo "Usage: log-training.sh '<json_array>'" && exit 1

mkdir -p "$DATA_DIR"

python3 - "$JSON_INPUT" "$DATA_DIR" << 'PY'
import sys, os, json
from datetime import date, datetime

json_input = sys.argv[1]
data_dir = sys.argv[2]

try:
    exercises = json.loads(json_input)
except json.JSONDecodeError as e:
    print(f"ERROR: Invalid JSON: {e}")
    sys.exit(1)

if not isinstance(exercises, list):
    exercises = [exercises]

# 保存到每日记录
t = date.today().isoformat()
time_str = datetime.now().strftime("%H:%M")

log_path = os.path.join(data_dir, "daily.json")
logs = json.load(open(log_path)) if os.path.exists(log_path) else {}
if t not in logs:
    logs[t] = {"meals":[],"training":[],"total_intake":0,"total_burned":0}

# 计算总容量和估计消耗
total_volume = 0
for ex in exercises:
    sets = ex.get("sets", 0)
    reps = ex.get("reps", "0")
    weight = ex.get("weight_kg", 0)

    # 处理 reps 可能是字符串的情况
    try:
        reps_num = int(reps) if isinstance(reps, str) else reps
    except:
        reps_num = 1

    volume = sets * reps_num * weight
    total_volume += volume

    entry = {
        "time": time_str,
        "name": ex.get("name", "Unknown"),
        "sets": sets,
        "reps": str(reps),
        "weight_kg": weight,
        "volume_kg": volume,
        "notes": ex.get("notes", "")
    }
    logs[t]["training"].append(entry)

# 估计消耗（简化公式：每 1000kg 容量约 100 kcal）
estimated_burn = round(total_volume / 10)
logs[t]["total_burned"] = logs[t].get("total_burned", 0) + estimated_burn

with open(log_path, "w") as f:
    json.dump(logs, f, indent=2, ensure_ascii=False)

# 输出结果
print(f"\n=== 训练已记录 ===")
print(f"时间: {time_str}")
print(f"动作数: {len(exercises)}")
print(f"总容量: {total_volume:.1f} kg")
print(f"估计消耗: {estimated_burn} kcal")
print()

for ex in exercises:
    name = ex.get("name", "Unknown")
    sets = ex.get("sets", "?")
    reps = ex.get("reps", "?")
    weight = ex.get("weight_kg", "?")
    print(f"  - {name}: {sets}x{reps} @ {weight}kg")
PY
