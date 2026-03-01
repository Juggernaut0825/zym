import { Message, ToolCall } from '../types';
import { AIService } from '../utils/ai-service';
import { ToolManager } from '../tools/tool-manager';
import { Logger } from '../utils/logger';

const ZJ_SYSTEM_PROMPT = `你是 ZJ，一个智能健身和生活助手。

## 核心能力
你通过唯一的 bash 工具来执行各种 skill 脚本，帮助用户：
1. 管理个人档案（身高、体重、目标等）
2. 追踪饮食和卡路里摄入
3. 记录和分析训练数据
4. 提供个性化的健身建议

## 数据存储
- 用户档案存储在 profile.json（持久信息）
- 每日数据存储在 daily.json（每日变化的摄入/消耗）

## 工作流程
1. 首次对话时，检查用户是否有完整档案（通过 bash 调用 get-profile.sh）
2. 当用户涉及饮食、卡路里、训练、体重、营养、身体数据等专业话题时，如果当前对话中还没有查过档案，先调用 get-profile.sh 获取用户信息再回答，这样才能给出个性化建议
3. 日常闲聊（打招呼、问天气等）不需要查档案，直接回复即可
4. 如果用户提到饮食或发送食物图片，调用相关脚本记录
5. 如果用户提到训练或发送训练视频，调用相关脚本分析
6. 用户询问进展时，调用 summary.sh 或 history.sh

## 重要原则
- 主动了解用户目标，但不要过于aggressive
- 给出建议时考虑用户的实际情况
- 用友好的语气交流，像朋友一样
- 适当追问缺失的信息（如体重、训练细节等）

可用脚本的详细说明见 bash 工具的 description。`;

export interface RunnerCallbacks {
  onText?: (text: string) => void;
  onToolStart?: (name: string) => void;
  onToolEnd?: (name: string, result: string) => void;
}

export interface RunResult {
  response: string;
  messages: Message[];
}

export class ConversationRunner {
  private maxTurns = 50;

  constructor(
    private aiService: AIService,
    private toolManager: ToolManager,
  ) {}

  async run(
    messages: Message[],
    callbacks?: RunnerCallbacks,
    context?: { userId?: string; platform?: string },
  ): Promise<RunResult> {
    // 确保有系统提示词
    if (!messages.find(m => m.role === 'system')) {
      messages.unshift({
        role: 'system',
        content: ZJ_SYSTEM_PROMPT,
      });
    }

    const tools = this.toolManager.getToolDefinitions();
    let turns = 0;

    while (turns++ < this.maxTurns) {
      Logger.info(`[Turn ${turns}] 调用 AI 推理`);

      const response = await this.aiService.chatStream(messages, tools, {
        onText: callbacks?.onText,
      });

      if (response.usage) {
        Logger.info(`[Turn ${turns}] Tokens: ${response.usage.promptTokens}+${response.usage.completionTokens}`);
      }

      // 没有工具调用，返回最终回复
      if (!response.toolCalls || response.toolCalls.length === 0) {
        return {
          response: response.content || '',
          messages,
        };
      }

      // 有工具调用
      Logger.info(`[Turn ${turns}] 工具调用: ${response.toolCalls.map(tc => tc.function.name).join(', ')}`);

      // 添加 assistant 消息
      messages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.toolCalls,
      });

      // 执行每个工具
      for (const toolCall of response.toolCalls) {
        callbacks?.onToolStart?.(toolCall.function.name);
        Logger.info(`[Turn ${turns}] 执行: ${toolCall.function.name}`);

        const result = await this.toolManager.executeTool(toolCall, context);

        Logger.info(`[Turn ${turns}] 完成: ${toolCall.function.name} (${result.content.length} chars)`);

        messages.push({
          role: 'tool',
          tool_call_id: result.tool_call_id,
          name: result.name,
          content: result.content,
        });

        callbacks?.onToolEnd?.(toolCall.function.name, result.content);
      }
    }

    return {
      response: '[达到最大轮次，请继续对话]',
      messages,
    };
  }
}
