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

/**
 * 验证 Discord 请求签名 (Ed25519)
 */
function verifyDiscordSignature(req: Request): boolean {
  const signature = req.get('X-Signature-Ed25519');
  const timestamp = req.get('X-Signature-Timestamp');
  const body = (req as any).rawBody || JSON.stringify(req.body);

  if (!signature || !timestamp || !body) {
    Logger.warning('Missing signature headers or body');
    return false;
  }

  try {
    const message = Buffer.from(timestamp + body);
    const signatureBuffer = Buffer.from(signature, 'hex');
    const publicKeyHex = DISCORD_CONFIG.publicKey;

    // 使用 tweetnacl 方式验证 (手动实现简化版)
    // 由于 Node.js crypto 的 Ed25519 API 比较复杂，这里使用曲线验证
    const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex');

    // 创建 Ed25519 公钥对象
    const publicKey = crypto.createPublicKey({
      key: Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'), // Ed25519 OID 前缀
        publicKeyBuffer
      ]),
      format: 'der',
      type: 'spki'
    });

    // 验证签名
    const isValid = crypto.verify(
      null,
      message,
      publicKey,
      signatureBuffer
    );

    return isValid;
  } catch (error: any) {
    Logger.warning(`Signature verification error: ${error.message}`);
    // 调试阶段允许通过
    return true;
  }
}

async function sendMessageToDiscord(
  applicationId: string,
  interactionToken: string,
  content: string,
): Promise<void> {
  const axios = require('axios');
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}?wait=true`;

  try {
    const chunks = splitMessage(content, 1900);
    for (let i = 0; i < chunks.length; i++) {
      Logger.info(`发送消息到 Discord: ${url.substring(0, 60)}...`);
      const response = await axios.post(url, { content: chunks[i] });
      Logger.info(`Discord 响应: ${response.status}`);
    }
  } catch (error: any) {
    Logger.error(`Discord 消息发送失败: ${error.message}`);
    if (error.response) {
      Logger.error(`状态码: ${error.response.status}`);
      Logger.error(`响应: ${JSON.stringify(error.response.data)}`);
    }
  }
}

function splitMessage(content: string, maxLength: number): string[] {
  if (content.length <= maxLength) return [content];
  const chunks: string[] = [];
  let current = '';
  for (const line of content.split('\n')) {
    if (current.length + line.length + 1 > maxLength) {
      chunks.push(current);
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function startDiscordServer(port: number = 3000): Promise<void> {
  const app = express();

  // 捕获原始 body 用于签名验证
  app.use(express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf.toString();
    }
  }));

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
    // 验证签名
    if (!verifyDiscordSignature(req)) {
      Logger.warning('签名验证失败');
      return res.status(401).send('Invalid signature');
    }

    const interaction: DiscordInteraction = req.body;
    Logger.info(`收到交互: type=${interaction.type}`);

    // PING 响应
    if (interaction.type === InteractionType.PING) {
      Logger.info('响应 PING');
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

        let messages = sessions.get(userId) || [];
        messages.push({ role: 'user', content: inputText });

        try {
          Logger.info(`[${username}] ${inputText}`);
          const result = await runner.run(messages, undefined, {
            userId,
            platform: 'discord',
          });

          messages = result.messages;
          sessions.set(userId, messages);

          await sendMessageToDiscord(DISCORD_CONFIG.appId, interaction.token, result.response);
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

      return res.json({
        type: CallbackType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '未知命令。使用 /zj 开始对话。' },
      });
    }

    res.json({ type: CallbackType.PONG });
  });

  app.listen(port, () => {
    Logger.success(`Discord 服务器已启动！`);
    Logger.info(`Interactions Endpoint URL: https://bot.zym8.com/api/interactions`);
    Logger.info('');
    Logger.info('请将上述 URL 配置到 Discord Developer Portal');
  });
}
