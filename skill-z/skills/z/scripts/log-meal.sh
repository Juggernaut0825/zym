#!/usr/bin/env bash
# log-meal.sh — 通过文字描述记录饮食
# Usage: bash scripts/log-meal.sh "<食物描述>"

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="$PROJECT_DIR/data/$USER_ID"

source "$PROJECT_DIR/.env" 2>/dev/null || { echo "ERROR: .env not found"; exit 1; }

DESC="${1:-}"
[ -z "$DESC" ] && echo "Usage: log-meal.sh \"<食物描述>\"" && exit 1

mkdir -p "$DATA_DIR"
echo "正在估算: $DESC..."

python3 - "$DESC" "$DATA_DIR" "$OPENROUTER_API_KEY" << 'PY'
import sys, os, json, requests
from datetime import date, datetime

desc = sys.argv[1]
data_dir = sys.argv[2]
api_key = sys.argv[3]

MODEL = "google/gemini-2.0-flash-exp:free"
URL = "https://openrouter.ai/api/v1/chat/completions"

prompt = f"""估算以下食物的卡路里和宏量营养素: {desc}

返回 ONLY valid JSON (不要添加任何其他文字):
{{
  "items": [
    {{"food": "食物名称", "calories": 数字, "protein_g": 数字, "carbs_g": 数字, "fat_g": 数字, "portion": "估计份量"}}
  ],
  "total": {{"calories": 数字, "protein_g": 数字, "carbs_g": 数字, "fat_g": 数字}},
  "description": "整体描述"
}}

根据常见份量进行合理估计。如果用户指定了份量，使用用户的估计。"""

r = requests.post(URL, headers={
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
}, json={"model": MODEL, "messages": [{"role":"user","content":prompt}], "max_tokens": 2048})
r.raise_for_status()

raw = r.json()["choices"][0]["message"]["content"]
raw = raw.strip().strip("`").removeprefix("json").strip()
data = json.loads(raw)

items = data.get("items", [])
total = data.get("total", {})
description = data.get("description", desc)

# 保存到每日记录
t = date.today().isoformat()
time_str = datetime.now().strftime("%H:%M")

log_path = os.path.join(data_dir, "daily.json")
logs = json.load(open(log_path)) if os.path.exists(log_path) else {}
if t not in logs:
    logs[t] = {"meals":[],"training":[],"total_intake":0,"total_burned":0}

meal_entry = {
    "time": time_str,
    "calories": total.get("calories", 0),
    "protein_g": total.get("protein_g", 0),
    "carbs_g": total.get("carbs_g", 0),
    "fat_g": total.get("fat_g", 0),
    "description": description,
    "items": items
}
logs[t]["meals"].append(meal_entry)
logs[t]["total_intake"] = sum(m.get("calories",0) for m in logs[t]["meals"])

with open(log_path, "w") as f:
    json.dump(logs, f, indent=2, ensure_ascii=False)

# 输出结果
print(f"\n=== 饮食已记录 ===")
print(f"时间: {time_str}")
print(f"描述: {description}")
print(f"\n总热量: {total.get('calories', 0)} kcal")
print(f"蛋白质: {total.get('protein_g', 0)}g | 碳水: {total.get('carbs_g', 0)}g | 脂肪: {total.get('fat_g', 0)}g")
print(f"\n今日累计摄入: {logs[t]['total_intake']} kcal")
PY
