import Anthropic from '@anthropic-ai/sdk';
import { Message, ToolDefinition, ToolCall } from '../types';

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

export class AIService {
  private client: Anthropic;
  private model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.GAUZ_LLM_API_KEY;
    if (!apiKey) {
      throw new Error('请设置 ANTHROPIC_API_KEY 或 GAUZ_LLM_API_KEY 环境变量');
    }

    this.client = new Anthropic({ apiKey });
    this.model = process.env.GAUZ_LLM_MODEL || 'claude-sonnet-4-20250514';
  }

  async chat(messages: Message[], tools: ToolDefinition[]): Promise<AIResponse> {
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemMessage?.content || '',
      messages: this.convertMessages(otherMessages),
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
    });

    return this.parseResponse(response);
  }

  async chatStream(
    messages: Message[],
    tools: ToolDefinition[],
    callbacks?: StreamCallbacks,
  ): Promise<AIResponse> {
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      system: systemMessage?.content || '',
      messages: this.convertMessages(otherMessages),
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
    });

    let content = '';
    const toolCalls: ToolCall[] = [];

    stream.on('text', (text) => {
      content += text;
      callbacks?.onText?.(text);
    });

    const response = await stream.finalMessage();

    // 提取工具调用
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: response.usage ? {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      } : undefined,
    };
  }

  private convertMessages(messages: Message[]): Anthropic.Messages.MessageParam[] {
    return messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.tool_call_id || '',
            content: msg.content || '',
          }],
        };
      }

      if (msg.role === 'assistant' && msg.tool_calls) {
        return {
          role: 'assistant',
          content: [
            ...(msg.content ? [{ type: 'text' as const, text: msg.content }] : []),
            ...msg.tool_calls.map(tc => ({
              type: 'tool_use' as const,
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments),
            })),
          ],
        };
      }

      return {
        role: msg.role as 'user' | 'assistant',
        content: msg.content || '',
      };
    });
  }

  private parseResponse(response: Anthropic.Messages.Message): AIResponse {
    let content = '';
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }
}
