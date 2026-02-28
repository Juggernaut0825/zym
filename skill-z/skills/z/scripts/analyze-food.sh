#!/usr/bin/env bash
# analyze-food.sh — 分析食物图片，估算卡路里和营养素
# Usage: bash scripts/analyze-food.sh <image_path>
# 支持: jpg, jpeg, png, gif, webp, heic

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="$PROJECT_DIR/data/$USER_ID"

source "$PROJECT_DIR/.env" 2>/dev/null || { echo "ERROR: .env not found"; exit 1; }

FILE_PATH="${1:-}"
[ -z "$FILE_PATH" ] && echo "Usage: analyze-food.sh <image_path>" && exit 1
[ ! -f "$FILE_PATH" ] && echo "ERROR: File not found: $FILE_PATH" && exit 1

# 处理 HEIC 格式
EXT="${FILE_PATH##*.}"
if [[ "${EXT,,}" == "heic" ]]; then
    echo "检测到 HEIC 格式，正在转换..."
    JPG_PATH="${FILE_PATH%.*}.jpg"
    sips -s format jpeg "$FILE_PATH" --out "$JPG_PATH" 2>/dev/null || {
        echo "ERROR: HEIC 转换失败，请安装 sips 或手动转换"
        exit 1
    }
    FILE_PATH="$JPG_PATH"
    echo "已转换为: $FILE_PATH"
fi

mkdir -p "$DATA_DIR"
echo "正在分析食物图片..."

python3 - "$FILE_PATH" "$DATA_DIR" "$OPENROUTER_API_KEY" << 'PY'
import sys, os, json, base64, requests
from datetime import date, datetime

file_path = sys.argv[1]
data_dir = sys.argv[2]
api_key = sys.argv[3]

MODEL = "google/gemini-2.0-flash-exp:free"
URL = "https://openrouter.ai/api/v1/chat/completions"

def mime_type(p):
    ext = os.path.splitext(p)[1].lower().strip(".")
    m = {"jpg":"image/jpeg","jpeg":"image/jpeg","png":"image/png",
         "gif":"image/gif","webp":"image/webp"}
    return m.get(ext, "image/jpeg")

def encode(p):
    with open(p, "rb") as f:
        return base64.b64encode(f.read()).decode()

def call_llm(prompt, img_path, max_tokens=2048):
    b64 = encode(img_path)
    mt = mime_type(img_path)
    content = [
        {"type":"image_url","image_url":{"url":f"data:{mt};base64,{b64}"}},
        {"type":"text","text":prompt},
    ]
    msgs = [{"role":"user","content":content}]
    r = requests.post(URL, headers={
        "Authorization":f"Bearer {api_key}",
        "Content-Type":"application/json",
    }, json={"model":MODEL,"messages":msgs,"max_tokens":max_tokens})
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]

def parse(raw):
    return json.loads(raw.strip().strip("`").removeprefix("json").strip())

def load_json(name, default=None):
    p = os.path.join(data_dir, name)
    if os.path.exists(p):
        with open(p) as f: return json.load(f)
    return default if default is not None else {}

def save_json(name, data):
    os.makedirs(data_dir, exist_ok=True)
    with open(os.path.join(data_dir, name), "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

# 分析食物
prompt = """分析这张食物图片。估算卡路里和宏量营养素。

返回 ONLY valid JSON (不要添加任何其他文字):
{
  "items": [
    {"food": "食物名称", "calories": 数字, "protein_g": 数字, "carbs_g": 数字, "fat_g": 数字, "portion": "份量估计"}
  ],
  "total": {"calories": 数字, "protein_g": 数字, "carbs_g": 数字, "fat_g": 数字},
  "description": "整体描述",
  "confidence": 0.0-1.0
}

如果图片中有多个食物，请列出每个。对份量进行合理估计。"""

raw = call_llm(prompt, file_path)
data = parse(raw)

items = data.get("items", [])
total = data.get("total", {})
description = data.get("description", "食物")

# 保存到每日记录
t = date.today().isoformat()
time_str = datetime.now().strftime("%H:%M")

logs = load_json("daily.json", {})
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

save_json("daily.json", logs)

# 输出结果
print(f"\n=== 食物分析结果 ===")
print(f"时间: {time_str}")
print(f"描述: {description}")
print(f"\n总热量: {total.get('calories', 0)} kcal")
print(f"蛋白质: {total.get('protein_g', 0)}g | 碳水: {total.get('carbs_g', 0)}g | 脂肪: {total.get('fat_g', 0)}g")
print(f"\n详细项目:")
for item in items:
    print(f"  - {item.get('food', '?')}: {item.get('calories', 0)} kcal ({item.get('portion', '?')})")

print(f"\n今日累计摄入: {logs[t]['total_intake']} kcal")
PY
