#!/usr/bin/env node

import { Command } from 'commander';
import * as readline from 'readline';
import ora from 'ora';
import dotenv from 'dotenv';
import { Logger } from './utils/logger';
import { AIService } from './utils/ai-service';
import { ToolManager } from './tools/tool-manager';
import { ConversationRunner, RunnerCallbacks } from './core/conversation-runner';
import { Message } from './types';
import { startDiscordServer } from './discord/server';

dotenv.config();

async function chatCommand(): Promise<void> {
  const aiService = new AIService();
  const toolManager = new ToolManager();
  const runner = new ConversationRunner(aiService, toolManager);

  Logger.brand();
  Logger.info(`已加载 ${toolManager.getToolCount()} 个工具`);
  Logger.info('开始对话吧！输入消息后按回车发送。输入 /exit 退出。');

  const messages: Message[] = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[36m> \x1b[0m',
  });

  rl.on('line', async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (trimmed.toLowerCase() === '/exit' || trimmed.toLowerCase() === 'exit') {
      console.log('\n再见！保持健康！\n');
      rl.close();
      process.exit(0);
    }

    // 添加用户消息
    messages.push({ role: 'user', content: trimmed });

    const spinner = ora('思考中...').start();
    let streamed = false;

    const callbacks: RunnerCallbacks = {
      onText: (text) => {
        if (!streamed) {
          spinner.stop();
          console.log('');
          streamed = true;
        }
        process.stdout.write(text);
      },
      onToolStart: (name) => {
        if (streamed) {
          console.log('\n');
          streamed = false;
        }
        spinner.stop();
        Logger.info(`执行工具: ${name}`);
        spinner.start();
      },
      onToolEnd: () => {
        spinner.text = '思考中...';
      },
    };

    try {
      const result = await runner.run(messages, callbacks);
      spinner.stop();

      if (streamed) {
        console.log('\n');
      } else {
        console.log('\n' + result.response + '\n');
      }
    } catch (error: any) {
      spinner.stop();
      Logger.error(`错误: ${error.message}`);
    }

    rl.prompt();
  });

  rl.on('SIGINT', () => {
    console.log('\n再见！保持健康！\n');
    process.exit(0);
  });

  rl.prompt();
}

async function main() {
  const program = new Command();

  program
    .name('zj')
    .description('ZJ - AI 健身和生活助手')
    .version('0.1.0');

  program
    .command('chat')
    .description('开始交互式对话')
    .action(chatCommand);

  program
    .command('discord')
    .description('启动 Discord 机器人')
    .action(async () => {
      await startDiscordServer();
    });

  // 默认进入聊天模式
  program
    .action(() => {
      chatCommand();
    });

  program.parse();
}

main().catch(console.error);
