import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool, ToolDefinition, ToolExecutionContext } from '../types';

const execAsync = promisify(exec);

/**
 * Bash 工具 - 执行 shell 命令
 * 这是 ZJ Agent 唯一的核心工具，所有功能通过 bash 调用 skill 脚本实现
 */
export class BashTool implements Tool {
  definition: ToolDefinition = {
    name: 'bash',
    description: `执行 shell 命令。可以通过 bash 调用 skill 脚本来实现各种功能。

可用的 skill 脚本（位于 ../skill-z/skills/z/scripts/）：

【用户档案管理】
- set-profile.sh: 设置用户基础信息（身高、体重、年龄、性别等）
- get-profile.sh: 获取当前用户档案
- update-profile.sh: 更新用户档案字段

【饮食追踪】
- analyze-food.sh <image_path>: 分析食物图片，估算卡路里和营养素
- log-meal.sh "<description>": 通过文字描述记录饮食
- get-daily-intake.sh [date]: 获取某天的摄入情况

【训练追踪】
- analyze-form.sh <video_path>: 分析训练视频，评估动作标准度
- log-training.sh '<json>': 记录训练数据
- get-daily-training.sh [date]: 获取某天的训练情况

【目标与计划】
- set-goal.sh <cut|bulk|maintain>: 设置健身目标
- get-plan.sh: 获取训练计划
- summary.sh: 获取今日/本周汇总

【历史查询】
- history.sh [days]: 查看历史记录

示例：
  bash { command: "bash ../skill-z/skills/z/scripts/get-profile.sh" }
  bash { command: "bash ../skill-z/skills/z/scripts/log-meal.sh \\"鸡蛋和吐司\\"" }
  bash { command: "bash ../skill-z/skills/z/scripts/summary.sh" }`,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '要执行的 shell 命令'
        },
        description: {
          type: 'string',
          description: '命令描述（可选）'
        },
        timeout: {
          type: 'number',
          description: '超时时间（毫秒），默认 60000ms'
        }
      },
      required: ['command']
    }
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const { command, description, timeout = 60000 } = args;

    if (!command) {
      return '错误：未提供命令';
    }

    const startTime = Date.now();

    try {
      // 设置环境变量，传递用户ID
      const env = {
        ...process.env,
        ZJ_USER_ID: context.userId || 'local',
        ZJ_PLATFORM: context.platform || 'cli',
      };

      const { stdout, stderr } = await execAsync(command, {
        cwd: context.workingDirectory,
        encoding: 'utf-8',
        timeout: timeout,
        maxBuffer: 10 * 1024 * 1024,
        env,
      });

      const output = stdout || '';
      const executionTime = Date.now() - startTime;

      let result = '';
      if (description) {
        result += `[${description}]\n`;
      }
      result += output;

      if (stderr && !output) {
        result += `\n[stderr] ${stderr}`;
      }

      return result || '(命令执行成功，无输出)';
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      const errorOutput = error.stderr || error.stdout || error.message;

      return `命令执行失败 (耗时: ${executionTime}ms):\n$ ${command}\n\n错误: ${errorOutput}`;
    }
  }
}
