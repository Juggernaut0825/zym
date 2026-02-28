import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { AIService } from '../utils/ai-service';
import { ToolManager } from '../tools/tool-manager';
import { ConversationRunner } from '../core/conversation-runner';
import { Message } from '../types';
import { Logger } from '../utils/logger';

// Discord 配置
const DISCORD_CONFIG = {
  appId: '1477401145042538496',
  publicKey: '5f53a7cbfdab893a56e6cf26caf50d1c0df1b1a1f85e4340a9d8e20fc255f2a2',
};

// Discord API 类型
interface DiscordInteraction {
  id: string;
  type: number;
  data?: {
    id: string;
    name: string;
    options?: Array<{ name: string; value: string | number }>;
  };
  member?: {
    user: {
      id: string;
      username: string;
      global_name?: string;
    };
  };
  user?: {
    id: string;
    username: string;
  };
  token: string;
  message?: {
    interaction?: {
      id: string;
    };
  };
}

// 交互类型
const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  MODAL_SUBMIT: 5,
};

// 回调类型
const CallbackType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
};

// 会话存储
const sessions = new Map<string, Message[]>();

function verifySignature(req: Request): boolean {
  const signature = req.get('X-Signature-Ed25519');
  const timestamp = req.get('X-Signature-Timestamp');

  if (!signature || !timestamp) {
    return false;
  }

  const body = JSON.stringify(req.body);

  try {
    const message = Buffer.from(timestamp + body);
    const sig = Buffer.from(signature, 'hex');
    const publicKey = Buffer.from(DISCORD_CONFIG.publicKey, 'hex');

    // 使用 tweetnacl 或其他 ed25519 库进行验证
    // 这里简化处理，实际部署时需要完整验证
    return true;
  } catch {
    return false;
  }
}

async function sendMessageToDiscord(
  applicationId: string,
  interactionToken: string,
  content: string,
): Promise<void> {
  const axios = require('axios');
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`;

  try {
    // Discord 限制消息长度为 2000 字符
    const chunks = splitMessage(content, 1900);

    for (let i = 0; i < chunks.length; i++) {
      await axios.post(url, {
        content: chunks[i],
      });
    }
  } catch (error: any) {
    Logger.error(`Discord 消息发送失败: ${error.message}`);
  }
}

function splitMessage(content: string, maxLength: number): string[] {
  if (content.length <= maxLength) {
    return [content];
  }

  const chunks: string[] = [];
  let current = '';

  const lines = content.split('\n');
  for (const line of lines) {
    if (current.length + line.length + 1 > maxLength) {
      chunks.push(current);
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export async function startDiscordServer(port: number = 3000): Promise<void> {
  const app = express();
  app.use(express.json());

  const aiService = new AIService();
  const toolManager = new ToolManager();
  const runner = new ConversationRunner(aiService, toolManager);

  Logger.brand();
  Logger.info(`Discord 服务器启动中...`);
  Logger.info(`App ID: ${DISCORD_CONFIG.appId}`);
  Logger.info(`端口: ${port}`);

  // 健康检查
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'zj-discord' });
  });

  // Discord 交互端点
  app.post('/api/interactions', async (req: Request, res: Response) => {
    const interaction: DiscordInteraction = req.body;

    // PING 响应
    if (interaction.type === InteractionType.PING) {
      return res.json({ type: CallbackType.PONG });
    }

    // 应用命令处理
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const userId = interaction.member?.user.id || interaction.user?.id || 'unknown';
      const username = interaction.member?.user.global_name ||
        interaction.member?.user.username ||
        interaction.user?.username ||
        'User';

      const commandName = interaction.data?.name || 'chat';
      const options = interaction.data?.options || [];
      const inputText = options.find(o => o.name === 'message')?.value as string ||
        options.find(o => o.name === 'text')?.value as string || '';

      if (commandName === 'zj' || commandName === 'chat') {
        // 立即返回延迟响应
        res.json({
          type: CallbackType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        });

        // 获取或创建会话
        let messages = sessions.get(userId) || [];

        // 添加用户消息
        messages.push({ role: 'user', content: inputText });

        try {
          Logger.info(`[${username}] ${inputText}`);

          // 执行对话
          const result = await runner.run(messages, undefined, {
            userId,
            platform: 'discord',
          });

          // 更新会话
          messages = result.messages;
          sessions.set(userId, messages);

          // 发送回复
          await sendMessageToDiscord(
            DISCORD_CONFIG.appId,
            interaction.token,
            result.response,
          );

          Logger.info(`[${username}] 回复已发送`);
        } catch (error: any) {
          Logger.error(`处理失败: ${error.message}`);
          await sendMessageToDiscord(
            DISCORD_CONFIG.appId,
            interaction.token,
            `抱歉，处理你的请求时出错：${error.message}`,
          );
        }

        return;
      }

      // 未知命令
      return res.json({
        type: CallbackType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '未知命令。使用 /zj 开始对话。',
        },
      });
    }

    // 其他交互类型
    res.json({ type: CallbackType.PONG });
  });

  app.listen(port, () => {
    Logger.success(`Discord 服务器已启动！`);
    Logger.info(`Interactions Endpoint URL: http://your-server:${port}/api/interactions`);
    Logger.info('');
    Logger.info('请将上述 URL 配置到 Discord Developer Portal 的 Interactions Endpoint URL');
  });
}
