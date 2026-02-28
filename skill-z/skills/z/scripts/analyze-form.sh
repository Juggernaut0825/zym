#!/usr/bin/env bash
# analyze-form.sh — 分析训练视频，评估动作标准度
# Usage: bash scripts/analyze-form.sh <video_path>
# 支持: mp4, webm, mov, avi, mkv

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="$PROJECT_DIR/data/$USER_ID"

source "$PROJECT_DIR/.env" 2>/dev/null || { echo "ERROR: .env not found"; exit 1; }

FILE_PATH="${1:-}"
[ -z "$FILE_PATH" ] && echo "Usage: analyze-form.sh <video_path>" && exit 1
[ ! -f "$FILE_PATH" ] && echo "ERROR: File not found: $FILE_PATH" && exit 1

mkdir -p "$DATA_DIR"
echo "正在分析训练视频..."

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
    m = {"mp4":"video/mp4","webm":"video/webm","mov":"video/quicktime",
         "avi":"video/x-msvideo","mkv":"video/x-matroska"}
    return m.get(ext, "video/mp4")

def encode(p):
    with open(p, "rb") as f:
        return base64.b64encode(f.read()).decode()

# 检查文件大小（Gemini 有 20MB 限制）
file_size = os.path.getsize(file_path)
if file_size > 20 * 1024 * 1024:
    print("WARNING: 视频文件超过 20MB，可能无法处理")
    print(f"当前大小: {file_size / 1024 / 1024:.1f}MB")

mt = mime_type(file_path)
b64 = encode(file_path)

prompt = """分析这个健身/训练视频。识别动作并提供专业评估。

返回 ONLY valid JSON (不要添加任何其他文字):
{
  "exercise": "识别的动作名称",
  "form_score": 1-10的评分,
  "issues": ["问题1", "问题2"],
  "coaching_cues": ["改进建议1", "改进建议2"],
  "injury_risk": "low|medium|high",
  "risk_reasons": ["风险原因"],
  "observations": "整体观察",
  "estimated_reps": 估计次数或null,
  "estimated_weight_kg": 估计重量或null
}

分析要点：
1. 识别具体动作（深蹲、硬拉、卧推等）
2. 检查姿势是否标准（脊柱中立、膝盖轨迹、深度等）
3. 指出潜在风险点
4. 给出具体的改进建议"""

content = [
    {"type":"video_url","video_url":{"url":f"data:{mt};base64,{b64}"}},
    {"type":"text","text":prompt},
]

r = requests.post(URL, headers={
    "Authorization":f"Bearer {api_key}",
    "Content-Type":"application/json",
}, json={"model":MODEL,"messages":[{"role":"user","content":content}],"max_tokens":2048})
r.raise_for_status()

raw = r.json()["choices"][0]["message"]["content"]
raw = raw.strip().strip("`").removeprefix("json").strip()
result = json.loads(raw)

# 保存到每日记录
t = date.today().isoformat()
time_str = datetime.now().strftime("%H:%M")

log_path = os.path.join(data_dir, "daily.json")
logs = json.load(open(log_path)) if os.path.exists(log_path) else {}
if t not in logs:
    logs[t] = {"meals":[],"training":[],"total_intake":0,"total_burned":0}

training_entry = {
    "time": time_str,
    "type": "form_check",
    "exercise": result.get("exercise", "Unknown"),
    "form_score": result.get("form_score", 0),
    "issues": result.get("issues", []),
    "coaching_cues": result.get("coaching_cues", []),
    "video_path": file_path
}
logs[t]["training"].append(training_entry)

with open(log_path, "w") as f:
    json.dump(logs, f, indent=2, ensure_ascii=False)

# 输出结果
print(f"\n=== 动作分析结果 ===")
print(f"动作: {result.get('exercise', 'Unknown')}")
print(f"评分: {result.get('form_score', '?')}/10")
print(f"受伤风险: {result.get('injury_risk', '?').upper()}")
if result.get('risk_reasons'):
    print(f"风险原因: {', '.join(result['risk_reasons'])}")

print(f"\n观察: {result.get('observations', '-')}")

if result.get('issues'):
    print(f"\n问题点:")
    for issue in result['issues']:
        print(f"  - {issue}")

if result.get('coaching_cues'):
    print(f"\n改进建议:")
    for cue in result['coaching_cues']:
        print(f"  → {cue}")
PY
