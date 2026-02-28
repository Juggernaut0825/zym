import axios from 'axios';
import { Message, MessageContent, ToolDefinition, ToolCall } from '../types';

export interface StreamCallbacks {
  onText?: (text: string) => void;
}

export interface AIResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * AI 服务 - 使用 OpenRouter 调用 Gemini 3 Flash
 */
export class AIService {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('请设置 OPENROUTER_API_KEY 环境变量');
    }

    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
    this.model = process.env.GAUZ_LLM_MODEL || 'google/gemini-3-flash-preview';
  }

  async chat(messages: Message[], tools: ToolDefinition[]): Promise<AIResponse> {
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const response = await axios.post(this.baseUrl, {
      model: this.model,
      messages: this.convertMessages(otherMessages, systemMessage?.content as string | undefined),
      tools: tools.length > 0 ? tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })) : undefined,
      max_tokens: 4096,
    }, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/Juggernaut0825/zym',
        'X-Title': 'ZJ Agent',
      },
    });

    return this.parseResponse(response.data);
  }

  async chatStream(
    messages: Message[],
    tools: ToolDefinition[],
    callbacks?: StreamCallbacks,
  ): Promise<AIResponse> {
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    // OpenRouter 支持流式，但这里简化处理，使用非流式
    // 如果需要真正的流式，需要使用 fetch + ReadableStream
    const response = await axios.post(this.baseUrl, {
      model: this.model,
      messages: this.convertMessages(otherMessages, systemMessage?.content as string | undefined),
      tools: tools.length > 0 ? tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })) : undefined,
      max_tokens: 4096,
      stream: false,
    }, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/Juggernaut0825/zym',
        'X-Title': 'ZJ Agent',
      },
    });

    const result = this.parseResponse(response.data);

    // 模拟流式回调
    if (callbacks?.onText && result.content) {
      callbacks.onText(result.content);
    }

    return result;
  }

  private convertMessages(messages: Message[], systemPrompt?: string): any[] {
    const result: any[] = [];

    // OpenRouter 使用 system 角色传递系统提示
    if (systemPrompt) {
      result.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    for (const msg of messages) {
      if (msg.role === 'tool') {
        // 工具结果作为 user 消息
        result.push({
          role: 'user',
          content: `[Tool Result: ${msg.name}]\n${msg.content || ''}`,
        });

        // 添加提示让模型继续
        result.push({
          role: 'assistant',
          content: '我已收到工具执行结果，继续处理...',
        });
      } else if (msg.role === 'assistant' && msg.tool_calls) {
        // 带工具调用的助手消息
        const content = msg.content || '';
        const toolCallsDesc = msg.tool_calls.map(tc => {
          const args = JSON.parse(tc.function.arguments);
          return `[Calling tool: ${tc.function.name}]\n${JSON.stringify(args, null, 2)}`;
        }).join('\n\n');

        result.push({
          role: 'assistant',
          content: content ? `${content}\n\n${toolCallsDesc}` : toolCallsDesc,
        });
      } else {
        result.push({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content || '',
        });
      }
    }

    return result;
  }

  private parseResponse(data: any): AIResponse {
    const choice = data.choices?.[0];
    if (!choice) {
      return { content: '' };
    }

    const message = choice.message;
    let content = message?.content || '';
    const toolCalls: ToolCall[] = [];

    // 检查是否有工具调用
    if (message?.tool_calls && Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        if (tc.type === 'function') {
          toolCalls.push({
            id: tc.id || `tc_${Date.now()}`,
            type: 'function',
            function: {
              name: tc.function.name,
              arguments: typeof tc.function.arguments === 'string'
                ? tc.function.arguments
                : JSON.stringify(tc.function.arguments),
            },
          });
        }
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0,
      } : undefined,
    };
  }
}
