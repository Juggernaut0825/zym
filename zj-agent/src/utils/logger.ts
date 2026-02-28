import chalk from 'chalk';

export class Logger {
  private static prefix = '[ZJ]';

  static info(message: string): void {
    console.log(chalk.blue(`${this.prefix} ${message}`));
  }

  static success(message: string): void {
    console.log(chalk.green(`${this.prefix} ✓ ${message}`));
  }

  static warning(message: string): void {
    console.log(chalk.yellow(`${this.prefix} ⚠ ${message}`));
  }

  static error(message: string): void {
    console.log(chalk.red(`${this.prefix} ✗ ${message}`));
  }

  static brand(): void {
    console.log(chalk.cyan.bold(`
╔══════════════════════════════╗
║         ZJ Agent             ║
║   Your AI Fitness Coach      ║
╚══════════════════════════════╝
`));
  }
}
