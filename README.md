# ZYM - AI 健身助手

智能健身和生活追踪助手，支持 Discord 集成。

## 项目结构

```
zym/
├── zj-agent/           # ZJ Agent 核心
│   └── src/
│       ├── index.ts    # 入口 (CLI + Discord)
│       ├── tools/      # 工具 (仅 bash)
│       ├── core/       # 对话引擎
│       └── discord/    # Discord 集成
│
└── skill-z/            # Z Skill 脚本集
    └── skills/z/
        ├── scripts/    # 功能脚本
        └── references/ # 参考文档
```

## 功能

- 用户档案管理（身高、体重、BMR、TDEE计算）
- 食物图片分析，估算卡路里和营养素
- 训练视频分析，评估动作标准度
- 饮食和训练记录
- 每日/每周汇总
- 个性化训练计划生成

## 快速开始

### 1. 配置环境变量

```bash
# skill-z/.env
OPENROUTER_API_KEY=your_key_here

# zj-agent/.env
ANTHROPIC_API_KEY=your_key_here
```

### 2. CLI 模式

```bash
cd zj-agent
npm install
npm run dev
```

### 3. Discord 模式

```bash
npm run discord
```

## 数据存储

- `profile.json` - 持久用户档案
- `daily.json` - 每日饮食/训练记录
- `training_plan.json` - 训练计划

## License

MIT
