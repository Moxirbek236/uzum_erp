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
        'Time-slot alert monitoring (Every 30s)',
        'Dashboard & Open Slots updates (Every 1 min)',
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

  @Post('trigger-dashboard-update')
  async triggerDashboardUpdate() {
    await this.botService.updateDashboardMessages();
    return { success: true, message: 'Dashboard va Open slots xabarlari yangilandi!' };
  }
}
