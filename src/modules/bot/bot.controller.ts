import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { BotService } from './bot.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('bot')
@UseGuards(JwtAuthGuard)
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Get('status')
  async getStatus() {
    return {
      connected: true,
      botTokenConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
      groupChatId: process.env.TELEGRAM_GROUP_ID || '5157263324',
      activeMonitors: [
        'Time-slot monitoring (Every 1 min)',
        'Daily Report (23:00)',
        'Monthly Report (1st of month)',
      ],
    };
  }

  @Post('test-message')
  async sendTestMessage(@Body('text') text?: string) {
    const defaultMsg =
      `<b>⚡ Uzum ERP Bot Test Xabari!</b>\n\n` +
      `Telegram guruh (${process.env.TELEGRAM_GROUP_ID || '5157263324'}) bilan aloqa muvaffaqiyatli o'rnatildi! ✅`;

    const success = await this.botService.sendGroupNotification(text || defaultMsg);
    return { success, message: success ? 'Xabar Telegram guruhga yuborildi!' : 'Xabar yuborishda xatolik' };
  }

  @Post('trigger-daily-report')
  async triggerDailyReport() {
    await this.botService.handleDailyReportCron();
    return { success: true, message: 'Kunlik hisobot Telegram guruhga yuborildi!' };
  }
}
