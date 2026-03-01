import { Client, GatewayIntentBits, Partials, Message as DiscordMessage } from 'discord.js';
import axios from 'axios';
// @ts-ignore
import heicConvert from 'heic-convert';
import { AIService } from '../utils/ai-service';
import { ToolManager } from '../tools/tool-manager';
import { ConversationRunner } from '../core/conversation-runner';
import { Message, ContentPart } from '../types';
import { Logger } from '../utils/logger';

// 会话存储
const sessions = new Map<string, Message[]>();

// 支持的格式
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const CONVERTIBLE_IMAGE_TYPES = ['image/heic', 'image/heif'];
const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/mpeg'];

/** 下载 HEIC/HEIF 并用 heic-convert 转成 JPEG base64 data URL */
async function convertToJpegDataUrl(url: string): Promise<string> {
  const resp = await axios.get(url, { responseType: 'arraybuffer' });
  const jpegBuffer = await heicConvert({
    buffer: Buffer.from(resp.data),
    format: 'JPEG',
    quality: 0.85,
  });
  const base64 = Buffer.from(jpegBuffer).toString('base64');
  return `data:image/jpeg;base64,${base64}`;
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

    // 构建消息内容：文字 + 图片（含 HEIC 转换）+ 视频
    const textContent = msg.content.replace(/<@!?\d+>/g, '').trim();
    const allAttachments = [...msg.attachments.values()];

    // 分类附件
    const directImages = allAttachments.filter(
      a => a.contentType != null && SUPPORTED_IMAGE_TYPES.includes(a.contentType)
    );
    const convertibleImages = allAttachments.filter(
      a => a.contentType != null && CONVERTIBLE_IMAGE_TYPES.includes(a.contentType)
    );
    const videoAttachments = allAttachments.filter(
      a => a.contentType != null && SUPPORTED_VIDEO_TYPES.includes(a.contentType)
    );

    const hasMedia = directImages.length > 0 || convertibleImages.length > 0 || videoAttachments.length > 0;

    let content: string | ContentPart[];
    if (hasMedia) {
      const parts: ContentPart[] = [];
      if (textContent) {
        parts.push({ type: 'text', text: textContent });
      }

      // 直接支持的图片
      for (const att of directImages) {
        parts.push({ type: 'image_url', image_url: { url: att.url } });
      }

      // HEIC/HEIF → JPEG 转换
      for (const att of convertibleImages) {
        try {
          Logger.info(`转换 ${att.name} (HEIC→JPEG)...`);
          const dataUrl = await convertToJpegDataUrl(att.url);
          parts.push({ type: 'image_url', image_url: { url: dataUrl } });
        } catch (err: any) {
          Logger.error(`HEIC 转换失败 (${att.name}): ${err.message}`);
          await msg.reply(`图片 ${att.name} 转换失败，请尝试发 JPG/PNG 格式`).catch(() => {});
        }
      }

      // 视频附件
      for (const att of videoAttachments) {
        parts.push({ type: 'video_url', video_url: { url: att.url } });
      }

      content = parts.length > 0 ? parts : (textContent || 'hello');
    } else {
      content = textContent || 'hello';
    }

    Logger.info(`[${username}] ${textContent || '(image)'}`);

    let messages = sessions.get(userId) || [];
    messages.push({ role: 'user', content });

    let typingInterval: ReturnType<typeof setInterval> | undefined;
    try {
      // 显示"正在输入"
      const channel = msg.channel;
      if ('sendTyping' in channel) {
        await channel.sendTyping();
      }
      typingInterval = setInterval(() => {
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
      if (typingInterval) clearInterval(typingInterval);
      Logger.error(`处理失败: ${error.message}`);
      await msg.reply(`抱歉，处理你的请求时出错：${error.message}`).catch(() => {});
    }
  });

  await client.login(token);
}
