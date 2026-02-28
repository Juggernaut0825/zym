export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ImageContentPart {
  type: 'image_url';
  image_url: { url: string };
}

export type ContentPart = TextContentPart | ImageContentPart;
export type MessageContent = string | ContentPart[];

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: MessageContent;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: 'tool';
  name: string;
  content: string;
  ok: boolean;
  errorCode?: string;
}

export interface ToolExecutionContext {
  workingDirectory: string;
  userId?: string;
  platform?: string;
  conversationHistory?: Message[];
}

export interface Tool {
  definition: ToolDefinition;
  execute(args: any, context: ToolExecutionContext): Promise<string>;
}

export interface SkillMeta {
  name: string;
  description: string;
  autoInvocable?: boolean;
  allowedTools?: string[];
  disallowedTools?: string[];
}

export interface SkillActivationSignal {
  skillName: string;
  systemPrompt: string;
  toolPolicy?: {
    allowedTools?: string[];
    disallowedTools?: string[];
  };
  maxTurns?: number;
}

export interface DiscordConfig {
  appId: string;
  publicKey: string;
  botToken?: string;
  port?: number;
}
