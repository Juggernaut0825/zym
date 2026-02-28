#!/usr/bin/env bash
# generate-plan.sh — 生成个性化训练计划
# Usage: bash scripts/generate-plan.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="$PROJECT_DIR/data/$USER_ID"

source "$PROJECT_DIR/.env" 2>/dev/null || { echo "ERROR: .env not found"; exit 1; }

mkdir -p "$DATA_DIR"
echo "正在生成训练计划..."

python3 - "$DATA_DIR" "$OPENROUTER_API_KEY" << 'PY'
import sys, os, json, requests
from datetime import date

data_dir = sys.argv[1]
api_key = sys.argv[2]

MODEL = "google/gemini-2.0-flash-exp:free"
URL = "https://openrouter.ai/api/v1/chat/completions"

# 加载用户档案
prof_path = os.path.join(data_dir, "profile.json")
profile = json.load(open(prof_path)) if os.path.exists(prof_path) else {}

goal = profile.get("goal", "maintain")
experience = profile.get("experience_level", "intermediate")
days_per_week = profile.get("training_days", 4)
preferences = profile.get("preferences", [])

prompt = f"""为用户生成一个个性化的训练计划。

用户信息:
- 目标: {goal} (cut=减脂, bulk=增肌, maintain=维持)
- 经验水平: {experience}
- 每周训练天数: {days_per_week}
- 偏好: {', '.join(preferences) if preferences else '无特殊偏好'}

返回 ONLY valid JSON:
{{
  "name": "计划名称",
  "created_at": "{date.today().isoformat()}",
  "goal": "{goal}",
  "days_per_week": {days_per_week},
  "days": [
    {{
      "day": "Day 1 - 推",
      "exercises": [
        {{"name": "Bench Press", "sets": 4, "reps": "8-10", "rest": "90s", "notes": "注意控制"}},
        ...
      ],
      "notes": "当天注意事项"
    }},
    ...
  ],
  "general_notes": "整体建议"
}}

根据目标调整计划:
- cut: 更高次数(12-15)，更短休息(60s)，加入更多有氧
- bulk: 更低次数(6-8)，更长休息(2-3min)，专注于复合动作
- maintain: 中等次数(8-12)，平衡训练"""

r = requests.post(URL, headers={
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
}, json={"model": MODEL, "messages": [{"role":"user","content":prompt}], "max_tokens": 4096})
r.raise_for_status()

raw = r.json()["choices"][0]["message"]["content"]
raw = raw.strip().strip("`").removeprefix("json").strip()
plan = json.loads(raw)

# 保存计划
plan_path = os.path.join(data_dir, "training_plan.json")
with open(plan_path, "w") as f:
    json.dump(plan, f, indent=2, ensure_ascii=False)

print(f"\n=== 训练计划已生成 ===")
print(f"计划名称: {plan.get('name', 'Custom')}")
print(f"目标: {plan.get('goal', '?')}")
print(f"每周训练: {plan.get('days_per_week', '?')} 天")
print()

for day in plan.get("days", []):
    print(f"【{day.get('day', '?')}】")
    for ex in day.get("exercises", []):
        name = ex.get("name", "?")
        sets = ex.get("sets", "?")
        reps = ex.get("reps", "?")
        print(f"  - {name}: {sets}x{reps}")
    print()

if plan.get("general_notes"):
    print(f"整体建议: {plan['general_notes']}")
PY
