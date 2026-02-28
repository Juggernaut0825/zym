---
name: z
description: >
  Z - 智能健身和生活追踪助手。
  支持食物图片分析、训练视频评估、饮食记录、训练追踪、目标设定等功能。
  使用 Gemini Flash (via OpenRouter) 进行多模态分析。
  通过 /z 或自动触发。
---

# Z - 智能健身助手

每个命令都是独立的 bash 脚本，位于 `scripts/` 目录。
Agent 通过 bash 工具调用这些脚本来实现各种功能。

## 环境配置

需要 `.env` 文件包含 `OPENROUTER_API_KEY`。参考 `.env.example`。

### 多用户数据隔离

所有脚本读取环境变量 `ZJ_USER_ID` 来隔离用户数据。
数据存储在 `data/{user_id}/` 目录下。

- 本地 CLI: 默认使用 `"local"`，无需配置
- 部署版 (Discord/Slack 等): 在调用脚本前设置 `ZJ_USER_ID` 为平台用户 ID

```bash
export ZJ_USER_ID="discord_123456"
bash scripts/get-profile.sh
```

## 数据结构

### profile.json (持久用户档案)
```json
{
  "height_cm": 175,
  "weight_kg": 70,
  "age": 25,
  "gender": "male",
  "body_fat_pct": 15,
  "bmr": 1700,
  "tdee": 2635,
  "goal": "maintain",
  "daily_target": 2635,
  "activity_level": "moderate",
  "notes": "用户备注"
}
```

### daily.json (每日记录)
```json
{
  "2024-01-15": {
    "meals": [
      {
        "time": "08:30",
        "calories": 450,
        "protein_g": 25,
        "carbs_g": 50,
        "fat_g": 15,
        "description": "鸡蛋和吐司",
        "items": [...]
      }
    ],
    "training": [
      {
        "time": "18:00",
        "name": "Back Squat",
        "sets": 4,
        "reps": "4",
        "weight_kg": 112.5,
        "notes": "感觉不错"
      }
    ],
    "total_intake": 1800,
    "total_burned": 300,
    "weight_kg": 70.2,
    "notes": "今日备注"
  }
}
```

## 脚本命令参考

### 档案管理

#### 设置/更新用户档案
```bash
bash scripts/set-profile.sh '<json>'
# 示例
bash scripts/set-profile.sh '{"height_cm":175,"weight_kg":70,"age":25,"gender":"male"}'
```

#### 获取用户档案
```bash
bash scripts/get-profile.sh
```

### 饮食追踪

#### 分析食物图片
```bash
bash scripts/analyze-food.sh <image_path>
# 支持: jpg, jpeg, png, gif, webp, heic
```

#### 文字记录饮食
```bash
bash scripts/log-meal.sh "<食物描述>"
# 示例
bash scripts/log-meal.sh "两个鸡蛋和一片全麦吐司"
```

#### 获取每日摄入
```bash
bash scripts/get-daily-intake.sh [date]
# date 格式: YYYY-MM-DD，默认今天
```

### 训练追踪

#### 分析训练视频
```bash
bash scripts/analyze-form.sh <video_path>
# 支持: mp4, webm, mov, avi, mkv
# 返回: 动作评分、问题点、改进建议、受伤风险
```

#### 记录训练
```bash
bash scripts/log-training.sh '<json_array>'
# 示例
bash scripts/log-training.sh '[{"name":"Back Squat","sets":4,"reps":"4","weight_kg":112.5}]'
```

#### 获取每日训练
```bash
bash scripts/get-daily-training.sh [date]
```

### 目标与计划

#### 设置健身目标
```bash
bash scripts/set-goal.sh <cut|bulk|maintain>
```

#### 获取训练计划
```bash
bash scripts/get-plan.sh
```

#### 生成新训练计划
```bash
bash scripts/generate-plan.sh
```

### 汇总与历史

#### 今日/本周汇总
```bash
bash scripts/summary.sh [today|week]
```

#### 历史记录
```bash
bash scripts/history.sh [days]
# days: 查看最近几天的记录，默认 7
```

### 图片处理

#### 转换 HEIC 到 JPG
```bash
bash scripts/convert-heic.sh <heic_path>
# 返回转换后的 jpg 文件路径
```
