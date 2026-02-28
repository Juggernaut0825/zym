import { Client, GatewayIntentBits, Partials, Message as DiscordMessage } from 'discord.js';
import { AIService } from '../utils/ai-service';
import { ToolManager } from '../tools/tool-manager';
import { ConversationRunner } from '../core/conversation-runner';
import { Message, ContentPart } from '../types';
import { Logger } from '../utils/logger';

// 会话存储
const sessions = new Map<string, Message[]>();

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

export async function startDiscordServer(): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error('请设置 DISCORD_BOT_TOKEN 环境变量');
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  });

  const aiService = new AIService();
  const toolManager = new ToolManager();
  const runner = new ConversationRunner(aiService, toolManager);

  client.on('ready', () => {
    Logger.brand();
    Logger.success(`Bot 已上线: ${client.user?.tag}`);
    Logger.info(`Bot ID: ${client.user?.id}`);
  });

  client.on('messageCreate', async (msg: DiscordMessage) => {
    if (msg.author.bot) return;

    // 群里需要 @bot，DM 直接响应
    const isDM = !msg.guild;
    const isMentioned = msg.mentions.has(client.user!.id);
    if (!isDM && !isMentioned) return;

    const userId = msg.author.id;
    const username = msg.author.globalName || msg.author.username;

    // 构建消息内容：文字 + 图片附件
    const textContent = msg.content.replace(/<@!?\d+>/g, '').trim();
    const imageAttachments = [...msg.attachments.values()].filter(
      a => a.contentType?.startsWith('image/')
    );

    let content: string | ContentPart[];
    if (imageAttachments.length > 0) {
      const parts: ContentPart[] = [];
      if (textContent) {
        parts.push({ type: 'text', text: textContent });
      }
      for (const att of imageAttachments) {
        parts.push({ type: 'image_url', image_url: { url: att.url } });
      }
      content = parts;
    } else {
      content = textContent || 'hello';
    }

    Logger.info(`[${username}] ${textContent || '(image)'}`);

    let messages = sessions.get(userId) || [];
    messages.push({ role: 'user', content });

    try {
      // 显示"正在输入"
      const channel = msg.channel;
      if ('sendTyping' in channel) {
        await channel.sendTyping();
      }
      const typingInterval = setInterval(() => {
        if ('sendTyping' in channel) {
          channel.sendTyping().catch(() => {});
        }
      }, 8000);

      const result = await runner.run(messages, undefined, {
        userId,
        platform: 'discord',
      });

      clearInterval(typingInterval);
      messages = result.messages;
      sessions.set(userId, messages);

      const chunks = splitMessage(result.response, 1900);
      for (const chunk of chunks) {
        await msg.reply(chunk);
      }
      Logger.info(`[${username}] 回复已发送`);
    } catch (error: any) {
      Logger.error(`处理失败: ${error.message}`);
      await msg.reply(`抱歉，处理你的请求时出错：${error.message}`).catch(() => {});
    }
  });

  await client.login(token);
}
