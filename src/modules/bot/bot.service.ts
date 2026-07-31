import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TelegramBot = require('node-telegram-bot-api');

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private bot: any = null;
  private readonly botToken = process.env.TELEGRAM_BOT_TOKEN;
  private readonly groupChatId = process.env.TELEGRAM_GROUP_ID || '5157263324';

  constructor(private readonly prisma: PrismaService) { }

  onModuleDestroy() {
    if (this.bot) {
      this.logger.log('Stopping Telegram Bot polling...');
      this.bot.stopPolling();
    }
  }

  onModuleInit() {
    if (!this.botToken) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not defined in .env. Bot initialization skipped.');
      return;
    }

    try {
      this.logger.log('Initializing Telegram Bot polling...');
      const BotConstructor = TelegramBot.default || TelegramBot;
      this.bot = new BotConstructor(this.botToken, { polling: true });

      // Handle Telegram Bot Commands
      this.bot.onText(/\/report/, async (msg: any) => {
        const reportMsg = await this.buildDailyReportMessage();
        this.bot?.sendMessage(msg.chat.id, reportMsg, { parse_mode: 'HTML' });
      });

      this.bot.onText(/\/slots/, async (msg: any) => {
        const chatId = msg.chat.id;
        const token = await this.getUzumToken();
        if (!token) {
          this.bot?.sendMessage(chatId, `<b>🕒 TIME-SLOT MONITORING HOLATI</b>\n\n❌ <i>Uzum token topilmadi. Avval login qiling.</i>`, { parse_mode: 'HTML' });
          return;
        }

        const shops = await this.prisma.shop.findMany({ take: 5 });
        if (!shops.length) {
          this.bot?.sendMessage(chatId, `<b>🕒 TIME-SLOT MONITORING HOLATI</b>\n\n❌ <i>Do'konlar topilmadi.</i>`, { parse_mode: 'HTML' });
          return;
        }

        this.bot?.sendMessage(chatId, `🔍 <b>Do'konlar bo'yicha erkin slotlar tekshirilmoqda...</b>`, { parse_mode: 'HTML' });

        for (const shop of shops) {
          try {
            const info = await this.findOpenSlotInfo(token, shop.uzumShopId);
            if (info && info.hasSlot && info.message && info.timeFrom) {
              const keyboard = {
                inline_keyboard: [
                  [{ text: '📥 Bron qilish', callback_data: `book_start:${shop.uzumShopId}:${info.timeFrom}` }],
                ],
              };
              this.bot?.sendMessage(chatId, info.message, { parse_mode: 'HTML', reply_markup: keyboard });
            } else {
              const noSlotMsg = `🏬 <b>${shop.name || 'Ombor'}</b>\n\n❌ <i>Hozircha erkin slot topilmadi.</i>`;
              this.bot?.sendMessage(chatId, noSlotMsg, { parse_mode: 'HTML' });
            }
          } catch (err) {
            this.logger.error(`Error checking slots for shop ${shop.uzumShopId} in /slots command`, err);
            this.bot?.sendMessage(chatId, `🏬 <b>${shop.name || 'Ombor'}</b>\n\n❌ <i>Ma'lumot olishda xatolik yuz berdi.</i>`, { parse_mode: 'HTML' });
          }
        }
      });

      this.bot.onText(/\/stats/, async (msg: any) => {
        const statsMsg = await this.buildStatsMessage();
        this.bot?.sendMessage(msg.chat.id, statsMsg, { parse_mode: 'HTML' });
      });

      // Handle inline keyboard button presses (bron qilish flow)
      this.bot.on('callback_query', (query: any) => {
        this.handleCallbackQuery(query).catch((err) =>
          this.logger.error('Unhandled callback_query error', err),
        );
      });

      this.logger.log(`Telegram Bot initialized successfully. Target Group ID: ${this.groupChatId}`);
    } catch (err) {
      this.logger.error('Failed to initialize Telegram Bot polling', err);
    }
  }

  /**
   * Helper to send HTML message to configured Telegram Group.
   * Optionally accepts a reply_markup (inline keyboard).
   */
  async sendGroupNotification(
    text: string,
    targetChatId?: string,
    replyMarkup?: any,
  ): Promise<boolean> {
    const chatId = targetChatId || this.groupChatId;
    if (!chatId) {
      this.logger.warn('No Telegram Group ID configured.');
      return false;
    }

    // Direct Telegram API fetch for maximum reliability
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId.startsWith('-') || chatId.length > 10 ? chatId : `-${chatId}`,
          text: text,
          parse_mode: 'HTML',
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      });

      if (!res.ok) {
        // Fallback without minus prefix if custom ID passed
        const fallbackRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML',
            ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
          }),
        });
        return fallbackRes.ok;
      }

      return true;
    } catch (err) {
      this.logger.error('Failed sending Telegram group message', err);
      return false;
    }
  }

  /**
   * Daily Report Cron Job: Runs every day at 23:00
   */
  @Cron('0 23 * * *')
  async handleDailyReportCron() {
    this.logger.log('Running Daily Report Cron Job for Telegram...');
    const message = await this.buildDailyReportMessage();
    await this.sendGroupNotification(message);
  }

  /**
   * Monthly Report Cron Job: Runs on 1st day of every month at 00:00
   */
  @Cron('0 0 1 * *')
  async handleMonthlyReportCron() {
    this.logger.log('Running Monthly Report Cron Job for Telegram...');
    const message = await this.buildMonthlyReportMessage();
    await this.sendGroupNotification(message);
  }

  /**
   * Time-Slot Monitoring Cron Job: Runs every 30 seconds
   * 1. Fetches the latest invoice ID from Uzum API
   * 2. Checks available time slots for that invoice
   * 3. Sends Telegram alert with "Bron qilish" button if slots are available
   */
  private isRunning = false;

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleSlotMonitoringCron() {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const token = await this.getUzumToken();
      if (!token) {
        return;
      }

      const shops = await this.prisma.shop.findMany({
        take: 5,
      });

      if (!shops.length) return;

      for (const shop of shops) {
        await this.checkSlotsForShop(token, shop.uzumShopId);
      }
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Shared helper: fetches token headers for Uzum Seller API requests.
   */
  private getAuthHeaders(token: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (token.includes('=')) {
      headers['Cookie'] = token;
    } else {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Shared helper: fetches the first available Uzum token from DB.
   */
  private async getUzumToken(): Promise<string | null> {
    const firstUser = await this.prisma.user.findFirst({
      where: { uzumToken: { not: null } },
    });
    return firstUser?.uzumToken || null;
  }

  /**
   * Checks a shop's latest invoice for open time slots within the next 3 days.
   * Returns the alert message text + the earliest open timeFrom, or hasSlot:false.
   */
  private async findOpenSlotInfo(
    token: string,
    shopId: number,
    daysLimit?: number
  ): Promise<{ hasSlot: boolean; message?: string; timeFrom?: number } | null> {
    try {
      const baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
      const headers = this.getAuthHeaders(token);

      // Step 1: Get latest invoice
      const invoiceRes = await fetch(
        `${baseUrl}/api/seller/shop/${shopId}/invoice?page=0&size=1`,
        { headers },
      );
      if (!invoiceRes.ok) return null;

      const invoices: any[] = await invoiceRes.json();
      if (!invoices || invoices.length === 0) return null;

      const latestInvoice = invoices[0];
      const invoiceId = latestInvoice.id;
      const stockTitle = latestInvoice.stock?.title || 'Ombor';
      const stockAddress = latestInvoice.stock?.address || '';
      const poolSource = latestInvoice.stock?.poolSource || 'FULLFILMENT';

      // Step 2: Check available time slots
      const slotRes = await fetch(
        `${baseUrl}/api/seller/shop/${shopId}/v2/invoice/time-slot/get`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            invoiceIds: [invoiceId],
            poolSource: poolSource,
            timeFrom: latestInvoice.timeSlotReservation?.timeFrom || Date.now(),
          }),
        },
      );
      if (!slotRes.ok) return null;

      const slotData = await slotRes.json();
      const timeSlots: { timeFrom: number; timeTo: number }[] =
        slotData?.payload?.timeSlots || [];

      if (timeSlots.length === 0) return { hasSlot: false };

      const reservedFrom = latestInvoice.timeSlotReservation?.timeFrom;

      // Sana filtri (agar daysLimit berilgan bo'lsa, faqat o'sha kungacha)
      const now = Date.now();

      const openSlots = timeSlots
        .filter(
          (s) =>
            s.timeFrom !== reservedFrom &&
            s.timeFrom >= now &&
            (!daysLimit || s.timeFrom <= now + daysLimit * 24 * 60 * 60 * 1000),
        )
        .sort((a, b) => a.timeFrom - b.timeFrom);

      if (openSlots.length === 0) return { hasSlot: false };

      const firstSlot = openSlots[0];
      const fromDate = new Date(firstSlot.timeFrom);
      const toDate = new Date(firstSlot.timeTo);

      const dateStr = fromDate.toLocaleDateString('uz-UZ', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const fromTime = fromDate.toLocaleTimeString('uz-UZ', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const toTime = toDate.toLocaleTimeString('uz-UZ', {
        hour: '2-digit',
        minute: '2-digit',
      });

      let slotsList = '';
      openSlots.slice(0, 3).forEach((s, i) => {
        const sFrom = new Date(s.timeFrom);
        const sTo = new Date(s.timeTo);
        const sDateStr = sFrom.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const sFromTime = sFrom.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
        const sToTime = sTo.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
        const prefix = i === openSlots.slice(0, 3).length - 1 && openSlots.length <= 3 ? '  └' : '  ├';
        slotsList += `${prefix} ✅ ${sDateStr} ${sFromTime} - ${sToTime}\n`;
      });
      if (openSlots.length > 3) {
        slotsList += `  └ ... va yana ${openSlots.length - 3} ta slot\n`;
      }

      const message =
        `<b>🚨 ERKIN TIME-SLOT TOPILDI!</b>\n\n` +
        `🏬 <b>Ombor:</b> ${stockTitle}\n` +
        `📍 <b>Manzil:</b> ${stockAddress}\n` +
        `📅 <b>Eng yaqin:</b> ${dateStr} ${fromTime} - ${toTime}\n` +
        `📦 <b>Nakladnoy ID:</b> #${invoiceId}\n` +
        `🔢 <b>Mavjud slot:</b> ${openSlots.length} ta\n` +
        `${slotsList}\n` +
        `⚡ <i>Bron qilish uchun quyidagi tugmani bosing!</i>`;

      return { hasSlot: true, message, timeFrom: firstSlot.timeFrom };
    } catch (err) {
      this.logger.error(`findOpenSlotInfo error for shopId ${shopId}`, err);
      return null;
    }
  }

  // Prevent spam by storing the last alerted timeFrom per shop
  private lastAlertedSlot: Record<number, number> = {};

  private async checkSlotsForShop(token: string, shopId: number) {
    // Background cron job faqata 4 kun ichidagi slotlarni tekshiradi
    const info = await this.findOpenSlotInfo(token, shopId, 4);
    if (!info || !info.hasSlot || !info.message || !info.timeFrom) return;

    // Deduplication check: if we already sent an alert for this exact slot, don't spam.
    if (this.lastAlertedSlot[shopId] === info.timeFrom) {
      return;
    }
    
    this.lastAlertedSlot[shopId] = info.timeFrom;

    await this.sendSlotAlert(shopId, info.message, info.timeFrom);
    this.logger.log(
      `Time-slot alert sent for shop ${shopId}, timeFrom ${info.timeFrom}`,
    );
  }

  /**
   * Sends the "erkin slot topildi" alert with an inline "Bron qilish" button.
   */
  private async sendSlotAlert(shopId: number, message: string, timeFrom: number) {
    const keyboard = {
      inline_keyboard: [
        [{ text: '📥 Bron qilish', callback_data: `book_start:${shopId}:${timeFrom}` }],
      ],
    };
    await this.sendGroupNotification(message, undefined, keyboard);
  }

  /**
   * Deletes the given message and sends a new one in its place (delete + create,
   * not edit — matches the requested UX for every button interaction).
   */
  private async deleteAndSend(
    chatId: number,
    messageId: number,
    text: string,
    replyMarkup?: any,
  ) {
    try {
      if (this.bot?.deleteMessage) {
        await this.bot.deleteMessage(chatId, messageId).catch(() => undefined);
      }
    } finally {
      await this.bot?.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    }
  }

  /**
   * Routes inline keyboard button presses.
   *  - book_start:{shopId}:{timeFrom}              -> show bookable invoices
   *  - book_select:{shopId}:{timeFrom}:{invoiceId}  -> perform booking
   *  - book_back:{shopId}                           -> go back to slot alert
   */
  private async handleCallbackQuery(query: any) {
    if (this.bot?.answerCallbackQuery) {
      this.bot.answerCallbackQuery(query.id).catch(() => undefined);
    }

    const data: string = query.data || '';
    const chatId = query.message?.chat?.id;
    const messageId = query.message?.message_id;
    if (!chatId || !messageId) return;

    try {
      if (data.startsWith('book_start:')) {
        const [, shopIdStr, timeFromStr] = data.split(':');
        await this.showInvoiceSelection(chatId, messageId, Number(shopIdStr), Number(timeFromStr));
      } else if (data.startsWith('book_select:')) {
        const [, shopIdStr, timeFromStr, invoiceIdStr] = data.split(':');
        const username = query.from?.username
          ? `@${query.from.username}`
          : query.from?.first_name || 'Foydalanuvchi';
        await this.performBooking(
          chatId,
          messageId,
          Number(shopIdStr),
          Number(timeFromStr),
          Number(invoiceIdStr),
          username,
        );
      } else if (data.startsWith('book_back:')) {
        const [, shopIdStr] = data.split(':');
        await this.backToSlotAlert(chatId, messageId, Number(shopIdStr));
      }
    } catch (err) {
      this.logger.error('handleCallbackQuery error', err);
    }
  }

  /**
   * "Bron qilish" bosilganda: timeSlotReservation === null va
   * invoiceStatus.value === 'CREATED' bo'lgan nakladnoylarni ro'yxat qilib chiqaradi.
   */
  private async showInvoiceSelection(
    chatId: number,
    messageId: number,
    shopId: number,
    timeFrom: number,
  ) {
    const token = await this.getUzumToken();
    if (!token) {
      await this.deleteAndSend(chatId, messageId, `❌ <i>Uzum token topilmadi.</i>`);
      return;
    }

    try {
      const baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
      const headers = this.getAuthHeaders(token);

      const res = await fetch(
        `${baseUrl}/api/seller/shop/${shopId}/invoice?page=0&size=20`,
        { headers },
      );

      if (!res.ok) {
        await this.deleteAndSend(
          chatId,
          messageId,
          `❌ <i>Nakladnoylarni olishda xatolik yuz berdi.</i>`,
          { inline_keyboard: [[{ text: '⬅️ Ortga', callback_data: `book_back:${shopId}` }]] },
        );
        return;
      }

      const invoices: any[] = await res.json();
      const bookable = (invoices || []).filter(
        (inv) => inv.invoiceStatus?.value === 'CREATED',
      );

      if (bookable.length === 0) {
        await this.deleteAndSend(
          chatId,
          messageId,
          `<b>📋 BRON QILISH UCHUN NAKLADNOY YO'Q</b>\n\n` +
          `❌ <i>Bron qilinmagan va "Yaratilgan" statusidagi nakladnoy topilmadi.</i>`,
          { inline_keyboard: [[{ text: '⬅️ Ortga', callback_data: `book_back:${shopId}` }]] },
        );
        return;
      }

      const buttons = bookable.map((inv) => [
        {
          text: `#${inv.id} — ${inv.totalToStock ?? 0} dona`,
          callback_data: `book_select:${shopId}:${timeFrom}:${inv.id}`,
        },
      ]);
      buttons.push([{ text: '⬅️ Ortga', callback_data: `book_back:${shopId}` }]);

      const text =
        `<b>📋 BRON QILISH UCHUN NAKLADNOY TANLANG</b>\n\n` +
        `🔢 <b>Jami:</b> ${bookable.length} ta nakladnoy\n\n` +
        `👇 <i>Kerakli nakladnoyni tanlang:</i>`;

      await this.deleteAndSend(chatId, messageId, text, { inline_keyboard: buttons });
    } catch (err) {
      this.logger.error(`showInvoiceSelection error for shopId ${shopId}`, err);
      await this.deleteAndSend(chatId, messageId, `❌ <i>Xatolik yuz berdi.</i>`);
    }
  }

  /**
   * "Ortga" bosilganda: shop uchun joriy erkin slotni qayta tekshirib,
   * yana "Bron qilish" tugmasi bilan alert xabarini qaytaradi.
   */
  private async backToSlotAlert(chatId: number, messageId: number, shopId: number) {
    const token = await this.getUzumToken();
    if (!token) {
      await this.deleteAndSend(chatId, messageId, `❌ <i>Uzum token topilmadi.</i>`);
      return;
    }

    const info = await this.findOpenSlotInfo(token, shopId);
    if (!info || !info.hasSlot || !info.message || !info.timeFrom) {
      await this.deleteAndSend(
        chatId,
        messageId,
        `<i>Bu do'kon uchun hozircha erkin slot topilmadi.</i>`,
      );
      return;
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: '📥 Bron qilish', callback_data: `book_start:${shopId}:${info.timeFrom}` }],
      ],
    };
    await this.deleteAndSend(chatId, messageId, info.message, keyboard);
  }

  /**
   * Tanlangan nakladnoy uchun time-slot bron qilish so'rovini yuboradi
   * va natijani (muvaffaqiyatli/xatolik) yangi xabar sifatida chiqaradi.
   */
  private async performBooking(
    chatId: number,
    messageId: number,
    shopId: number,
    timeFrom: number,
    invoiceId: number,
    username: string,
  ) {
    const token = await this.getUzumToken();
    if (!token) {
      await this.deleteAndSend(chatId, messageId, `❌ <i>Uzum token topilmadi.</i>`);
      return;
    }

    try {
      const baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
      const headers = this.getAuthHeaders(token);

      const res = await fetch(
        `${baseUrl}/api/seller/shop/${shopId}/v2/invoice/time-slot/set`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            timeFrom,
            invoiceIds: [invoiceId],
            stockId: 34,
            poolSource: 'FULLFILMENT',
          }),
        },
      );

      const resultData = await res.json().catch(() => null);

      if (res.ok) {
        const text =
          `<b>✅ Muvaffaqiyatli bron qilindi!</b>\n\n` +
          `📦 <b>Nakladnoy ID:</b> #${invoiceId}\n` +
          `👤 <b>Bron qildi:</b> ${username}`;
        await this.deleteAndSend(chatId, messageId, text);
        this.logger.log(`Booking success for invoice ${invoiceId} by ${username}`);
      } else {
        const errMsg = resultData?.message || resultData?.error || `HTTP ${res.status}`;
        const text =
          `<b>❌ Bron qilishda xatolik!</b>\n\n` +
          `📦 <b>Nakladnoy ID:</b> #${invoiceId}\n` +
          `👤 <b>Urinish:</b> ${username}\n` +
          `⚠️ <b>Xato:</b> ${errMsg}`;
        await this.deleteAndSend(chatId, messageId, text);
      }
    } catch (err) {
      this.logger.error(`performBooking error for invoice ${invoiceId}`, err);
      await this.deleteAndSend(chatId, messageId, `❌ <i>Bron qilishda xatolik yuz berdi.</i>`);
    }
  }

  private async buildDailyReportMessage(): Promise<string> {
    const today = new Date().toLocaleDateString('uz-UZ');
    const [shopsCount, productsCount, unreadReviewsCount, totalOrders] = await Promise.all([
      this.prisma.shop.count(),
      this.prisma.product.count(),
      this.prisma.review.count({ where: { isRead: false } }),
      this.prisma.order.count(),
    ]);

    const revenueAggregate = await this.prisma.order.aggregate({
      _sum: { sellPrice: true },
    });
    const revenue = revenueAggregate._sum?.sellPrice || 0;

    return `<b>📊 KUNLIK YAKUNIY HISOBOT (Uzum ERP)</b>\n` +
      `📅 <b>Sana:</b> ${today}\n\n` +
      `💰 <b>Jami Tushum:</b> ${new Intl.NumberFormat('uz-UZ').format(revenue)} UZS\n` +
      `📦 <b>Jami Buyurtmalar:</b> ${totalOrders} ta\n` +
      `⭐ <b>O'qilmagan Sharhlar:</b> ${unreadReviewsCount} ta\n` +
      `🏬 <b>Faol Do'konlar:</b> ${shopsCount} ta\n` +
      `🛍️ <b>Mahsulotlar Soni:</b> ${productsCount} ta\n\n` +
      `✅ <i>Barcha avtomatik sinxronlashlar muvaffaqiyatli bajarildi!</i>`;
  }

  private async buildMonthlyReportMessage(): Promise<string> {
    const monthName = new Date().toLocaleDateString('uz-UZ', { month: 'long', year: 'numeric' });
    const [shopsCount, totalOrders] = await Promise.all([
      this.prisma.shop.count(),
      this.prisma.order.count(),
    ]);

    const revenueAggregate = await this.prisma.order.aggregate({
      _sum: { sellPrice: true },
    });
    const revenue = revenueAggregate._sum?.sellPrice || 0;

    return `<b>🏆 OYLIK YAKUNIY HISOBOT (Uzum ERP)</b>\n` +
      `📅 <b>Davr:</b> ${monthName}\n\n` +
      `💰 <b>Oylik Tushum:</b> ${new Intl.NumberFormat('uz-UZ').format(revenue)} UZS\n` +
      `📦 <b>Oylik Buyurtmalar:</b> ${totalOrders} ta\n` +
      `🏬 <b>Ulangan Do'konlar:</b> ${shopsCount} ta\n\n` +
      `📈 <i>ERP Avtomatizatsiya tizimi barqaror ishlamoqda.</i>`;
  }



  private async buildStatsMessage(): Promise<string> {
    const [shops, products, reviews] = await Promise.all([
      this.prisma.shop.count(),
      this.prisma.product.count(),
      this.prisma.review.count(),
    ]);

    return `<b>📈 UZUM ERP STATISTIKA</b>\n\n` +
      `🏬 <b>Do'konlar:</b> ${shops} ta\n` +
      `🛍️ <b>Mahsulotlar:</b> ${products} ta\n` +
      `⭐ <b>Sharhlar:</b> ${reviews} ta\n`;
  }
}