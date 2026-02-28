import { Tool, ToolDefinition, ToolCall, ToolResult, ToolExecutionContext } from '../types';
import { BashTool } from './bash-tool';

/**
 * 工具管理器 - 管理所有可用的工具
 * ZJ Agent 精简版，只保留 bash 工具
 */
export class ToolManager {
  private tools: Map<string, Tool> = new Map();
  private workingDirectory: string;

  constructor(workingDirectory: string = process.cwd()) {
    this.workingDirectory = workingDirectory;
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    // ZJ Agent 只有一个核心工具：bash
    this.registerTool(new BashTool());
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => tool.definition);
  }

  async executeTool(
    toolCall: ToolCall,
    contextOverrides?: Partial<ToolExecutionContext>,
  ): Promise<ToolResult> {
    const toolName = toolCall.function.name;
    const tool = this.tools.get(toolName);

    if (!tool) {
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: toolName,
        content: `错误：未找到工具 "${toolName}"`,
        ok: false,
        errorCode: 'TOOL_NOT_FOUND',
      };
    }

    try {
      const context: ToolExecutionContext = {
        workingDirectory: this.workingDirectory,
        conversationHistory: [],
        ...contextOverrides,
      };

      let args: unknown;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (error: any) {
        return {
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolCall.function.name,
          content: `工具参数解析错误: ${error.message}`,
          ok: false,
          errorCode: 'INVALID_TOOL_ARGUMENTS',
        };
      }

      const output = await tool.execute(args, context);

      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: toolCall.function.name,
        content: output,
        ok: true,
      };
    } catch (error: any) {
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: toolCall.function.name,
        content: `工具执行错误: ${error.message}`,
        ok: false,
        errorCode: 'TOOL_EXECUTION_ERROR',
      };
    }
  }

  getToolCount(): number {
    return this.tools.size;
  }
}
