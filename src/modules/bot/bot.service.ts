import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { UzumAuthService } from '../uzum-integration/uzum-auth/uzum-auth.service';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TelegramBot = require('node-telegram-bot-api');

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private bot: any = null;
  private readonly botToken = process.env.TELEGRAM_BOT_TOKEN;
  private readonly baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
  private readonly groupChatId = process.env.TELEGRAM_GROUP_ID || '5157263324';
  private readonly stateFilePath = path.join(process.cwd(), 'bot-state.json');
  private botState: { 
    reportMessageId?: number, 
    slotsMessageId?: number,
    resolvedGroupChatId?: string,
    groupMembers?: Record<number, { id: number; username?: string; name: string }>,
    shopAlerts?: Record<number, { messageId?: number; hasSlot: boolean; isInteracting: boolean; interactionUntil?: number }>
  } = {};

  constructor(
    private readonly prisma: PrismaService,
    private readonly uzumAuthService: UzumAuthService
  ) { 
    this.loadState();
  }

  private loadState() {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const data = fs.readFileSync(this.stateFilePath, 'utf8');
        this.botState = JSON.parse(data);
      }
      if (!this.botState.shopAlerts) {
        this.botState.shopAlerts = {};
      }
      if (!this.botState.groupMembers) {
        this.botState.groupMembers = {};
      }
    } catch (err) {
      this.botState.shopAlerts = {};
      this.botState.groupMembers = {};
      this.logger.error('Failed to load bot state', err);
    }
  }

  private saveState() {
    try {
      fs.writeFileSync(this.stateFilePath, JSON.stringify(this.botState, null, 2), 'utf8');
    } catch (err) {
      this.logger.error('Failed to save bot state', err);
    }
  }

  getTargetChatId(): string {
    if (this.botState.resolvedGroupChatId) {
      return this.botState.resolvedGroupChatId;
    }
    const raw = (this.groupChatId || '5157263324').trim();
    if (raw.startsWith('-')) {
      return raw;
    }
    if (raw.length >= 9) {
      return `-100${raw}`;
    }
    return `-${raw}`;
  }

  async sendToGroup(text: string, options?: any): Promise<any> {
    const primaryId = this.getTargetChatId();
    const raw = (this.groupChatId || '5157263324').trim();
    const candidateIds = Array.from(new Set([
      primaryId,
      raw.startsWith('-') ? raw : `-100${raw}`,
      raw.startsWith('-') ? raw : `-${raw}`,
      raw,
    ]));

    let lastError: any = null;
    for (const chatId of candidateIds) {
      try {
        const res = await this.bot.sendMessage(chatId, text, {
          parse_mode: 'HTML',
          ...options,
        });
        if (res && res.message_id) {
          this.botState.resolvedGroupChatId = chatId;
          this.saveState();
          return res;
        }
      } catch (err: any) {
        lastError = err;
        const desc = err.response?.body?.description || err.message || '';
        if (desc.includes('chat not found') || desc.includes('chat_id is empty')) {
          continue;
        }
        throw err;
      }
    }
    throw lastError || new Error(`Could not send message to any target chat ID: ${candidateIds.join(', ')}`);
  }

  async editGroupMessage(messageId: number, text: string, options?: any): Promise<any> {
    const chatId = this.getTargetChatId();
    return await this.bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      ...options,
    });
  }

  async deleteGroupMessage(messageId: number): Promise<void> {
    const chatId = this.getTargetChatId();
    await this.bot.deleteMessage(chatId, messageId).catch(() => {});
  }

  async getGroupMentions(): Promise<string> {
    try {
      const chatId = this.getTargetChatId();
      const userMap = new Map<number, string>();

      // 1. Fetch group administrators
      const admins = await this.bot?.getChatAdministrators(chatId).catch(() => []);
      if (Array.isArray(admins)) {
        for (const admin of admins) {
          const u = admin.user;
          if (u && !u.is_bot) {
            if (u.username) {
              userMap.set(u.id, `@${u.username}`);
            } else {
              userMap.set(u.id, `<a href="tg://user?id=${u.id}">${u.first_name || 'Foydalanuvchi'}</a>`);
            }
          }
        }
      }

      // 2. Fetch known group members captured from messages
      if (this.botState.groupMembers) {
        for (const [idStr, u] of Object.entries(this.botState.groupMembers)) {
          const id = Number(idStr);
          if (!userMap.has(id)) {
            if (u.username) {
              userMap.set(id, `@${u.username}`);
            } else {
              userMap.set(id, `<a href="tg://user?id=${id}">${u.name || 'Foydalanuvchi'}</a>`);
            }
          }
        }
      }

      const mentions = Array.from(userMap.values());
      return mentions.join(' ');
    } catch (err) {
      this.logger.warn('Failed getting group mentions', err);
      return '';
    }
  }

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

      // Handle Telegram Bot Messages: auto-detect group chat id, track members & clean user messages
      this.bot.on('message', async (msg: any) => {
        if (msg.from && !msg.from.is_bot) {
          if (!this.botState.groupMembers) this.botState.groupMembers = {};
          this.botState.groupMembers[msg.from.id] = {
            id: msg.from.id,
            username: msg.from.username,
            name: [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || 'Foydalanuvchi',
          };
          this.saveState();
        }

        if (msg.chat) {
          if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
            if (this.botState.resolvedGroupChatId !== msg.chat.id.toString()) {
              this.botState.resolvedGroupChatId = msg.chat.id.toString();
              this.saveState();
              this.logger.log(`Auto-detected Telegram groupChatId: ${this.botState.resolvedGroupChatId}`);
            }
          }

          const targetId = this.getTargetChatId();
          if (msg.chat.id.toString() === targetId || msg.chat.id.toString() === this.groupChatId || msg.chat.id.toString() === `-${this.groupChatId}`) {
            try {
              await this.bot.deleteMessage(msg.chat.id, msg.message_id).catch(() => null);
            } catch (e) {}
          }
        }
      });
      
      this.bot.onText(/\/report/, async () => {
        await this.updateDashboardMessages();
      });

      this.bot.onText(/\/slots/, async () => {
        await this.handleSlotMonitoringCron();
      });

      this.bot.onText(/\/stats/, async () => {
        await this.updateDashboardMessages();
      });

      // Handle inline keyboard button presses (bron qilish flow)
      this.bot.on('callback_query', (query: any) => {
        this.handleCallbackQuery(query).catch((err) =>
          this.logger.error('Unhandled callback_query error', err),
        );
      });

      this.logger.log(`Telegram Bot initialized successfully. Target Group ID: ${this.getTargetChatId()}`);
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
    try {
      if (targetChatId) {
        await this.bot.sendMessage(targetChatId, text, {
          parse_mode: 'HTML',
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        });
        return true;
      }
      await this.sendToGroup(text, replyMarkup ? { reply_markup: replyMarkup } : {});
      return true;
    } catch (err) {
      this.logger.error('Failed sending Telegram group message', err);
      return false;
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async updateDashboardMessages() {
    this.logger.log('Updating dashboard and slots messages...');
    
    // Update Dashboard Report
    try {
        const reportText = await this.buildMainDashboardMessage();
        if (this.botState.reportMessageId) {
            try {
                await this.editGroupMessage(this.botState.reportMessageId, reportText);
            } catch (err: any) {
                if (err.response?.body?.description?.includes('message to edit not found')) {
                    const res = await this.sendToGroup(reportText);
                    this.botState.reportMessageId = res.message_id;
                    this.saveState();
                } else if (!err.response?.body?.description?.includes('message is not modified')) {
                    this.logger.error('Failed to edit report message', err);
                }
            }
        } else {
            const res = await this.sendToGroup(reportText);
            this.botState.reportMessageId = res.message_id;
            this.saveState();
        }
    } catch(err) {
        this.logger.error('Error in updateDashboardMessages (report)', err);
    }

    // Update Open Slots
    try {
        const slotsText = await this.buildOpenSlotsMessage();
        if (this.botState.slotsMessageId) {
            try {
                await this.editGroupMessage(this.botState.slotsMessageId, slotsText);
            } catch (err: any) {
                if (err.response?.body?.description?.includes('message to edit not found')) {
                    const res = await this.sendToGroup(slotsText);
                    this.botState.slotsMessageId = res.message_id;
                    this.saveState();
                } else if (!err.response?.body?.description?.includes('message is not modified')) {
                    this.logger.error('Failed to edit slots message', err);
                }
            }
        } else {
            const res = await this.sendToGroup(slotsText);
            this.botState.slotsMessageId = res.message_id;
            this.saveState();
        }
    } catch(err) {
         this.logger.error('Error in updateDashboardMessages (slots)', err);
    }
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
        await this.checkSlotsForShop(token, shop.uzumShopId, shop.name);
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

  private async refreshUzumToken(): Promise<string | null> {
    if (process.env.AUTO_LOGIN !== 'true') return null;
    const autoUser = process.env.UZUM_USERNAME;
    const autoPass = process.env.UZUM_PASSWORD;
    if (!autoUser || !autoPass) return null;

    this.logger.log('Auto-login triggered due to 401 Unauthorized in BotService');
    const session = await this.uzumAuthService.loginToUzum(autoUser, autoPass);
    if (session && session.token) {
      const user = await this.prisma.user.findFirst({ where: { uzumToken: { not: null } } });
      if (user) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { uzumToken: session.token }
        });
        return session.token;
      }
    }
    return null;
  }

  /**
   * Checks a shop's latest invoice for open time slots within the next 3 days.
   * Returns the alert message text + the earliest open timeFrom, or hasSlot:false.
   */
  private async findOpenSlotInfo(
    token: string,
    shopId: number,
    daysLimit?: number,
    shopName?: string,
  ): Promise<{ hasSlot: boolean; message?: string; timeFrom?: number; debug?: string; openSlots?: any[] } | null> {
    try {
      const baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
      const headers = this.getAuthHeaders(token);

      // Step 1: Get latest CREATED invoice
      const invoiceRes = await fetch(
        `${baseUrl}/api/seller/shop/${shopId}/invoice?page=0&size=20`,
        { headers },
      );
      
      if (invoiceRes.status === 401) {
        const newToken = await this.refreshUzumToken();
        if (newToken) {
            return { hasSlot: false, debug: `Token yangilandi (Auto-login). Keyingi tekshiruvda ishlaydi.` };
        }
      }

      if (!invoiceRes.ok) return { hasSlot: false, debug: `Invoice API returned status: ${invoiceRes.status}` };

      const rawInvoices = await invoiceRes.json();
      const invoices = rawInvoices?.payload ? rawInvoices.payload : rawInvoices;
      
      if (!Array.isArray(invoices)) {
        return { hasSlot: false, debug: `Invoices is not an array. Keys: ${Object.keys(invoices || {}).join(',')}` };
      }
      if (invoices.length === 0) {
        return { hasSlot: false, debug: `Invoices array is empty` };
      }

      const validStatuses = ['CREATED', 'READY_FOR_DELIVERY'];
      let latestInvoice = invoices.find(inv => inv.invoiceStatus?.value === 'CREATED');
      if (!latestInvoice) {
        latestInvoice = invoices.find(inv => inv.invoiceStatus?.value === 'READY_FOR_DELIVERY');
      }
      if (!latestInvoice) {
        latestInvoice = invoices[0]; // fallback
      }

      const invoiceId = latestInvoice.id;
      const stockTitle = latestInvoice.stock?.title || 'Ombor';
      const stockAddress = latestInvoice.stock?.address || '';
      const poolSource = latestInvoice.stock?.poolSource || 'FULLFILMENT';

      // Step 2: Check available time slots
      const tashkentOffsetMs = 5 * 60 * 60 * 1000;
      const payloadObj = {
        invoiceIds: [Number(invoiceId || latestInvoice.invoiceId)],
        poolSource: poolSource || 'FULLFILMENT',
        timeFrom: Date.now() + tashkentOffsetMs,
      };

      const slotRes = await fetch(
        `${baseUrl}/api/seller/shop/${shopId}/v2/invoice/time-slot/get`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(payloadObj),
        },
      );
      if (!slotRes.ok) {
        const errText = await slotRes.text().catch(() => '');
        return { hasSlot: false, debug: `Slot API error ${slotRes.status} on payload ${JSON.stringify(payloadObj)}: ${errText}` };
      }

      const slotData = await slotRes.json();
      const timeSlots: { timeFrom: number; timeTo: number }[] =
        slotData?.payload?.timeSlots || [];

      if (timeSlots.length === 0) {
        return { hasSlot: false, debug: `Uzum API returned 0 timeSlots for invoice ${invoiceId}` };
      }

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

      if (openSlots.length === 0) {
        return { hasSlot: false, debug: `Found ${timeSlots.length} slots, but all filtered out. First slot timeFrom: ${timeSlots[0]?.timeFrom}, Now: ${now}, DaysLimit: ${daysLimit}`, openSlots: [] };
      }

      const firstSlot = openSlots[0];
      const fromDate = new Date(firstSlot.timeFrom);
      const toDate = new Date(firstSlot.timeTo);

      const sDateStr = fromDate.toLocaleDateString('ru-RU', { timeZone: 'Asia/Tashkent' });
      const sFromTime = fromDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
      const sToTime = toDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });

      let msg = `🏬 <b>${shopName || 'Ombor'}</b>\n\n`;
      msg += `📦 Nakladnoy: <b>${invoiceId}</b>\n`;
      msg += `✅ <b>Erkin slotlar topildi!</b>\n\n`;
      msg += `📌 Eng yaqin vaqt: <b>${sDateStr} ${sFromTime} - ${sToTime}</b>\n`;

      let slotsList = '';
      openSlots.slice(0, 3).forEach((s, i) => {
        const sFrom = new Date(s.timeFrom);
        const sTo = new Date(s.timeTo);
        const sDateStr = sFrom.toLocaleDateString('ru-RU', { timeZone: 'Asia/Tashkent' });
        const sFromTime = sFrom.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
        const sToTime = sTo.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });

        const prefix = i === 0 ? '🕒' : '🗓';
        slotsList += `${prefix} ✅ ${sDateStr} ${sFromTime} - ${sToTime}\n`;
      });
      if (openSlots.length > 3) {
        slotsList += `  └ ... va yana ${openSlots.length - 3} ta slot\n`;
      }

      const message =
        `<b>🚨 ERKIN TIME-SLOT TOPILDI!</b>\n\n` +
        `🏪 <b>Do'kon:</b> ${shopName || 'Noma\'lum'}\n` +
        `🏬 <b>Ombor:</b> ${stockTitle}\n` +
        `📍 <b>Manzil:</b> ${stockAddress}\n` +
        `📅 <b>Eng yaqin:</b> ${sDateStr} ${sFromTime} - ${sToTime}\n` +
        `📦 <b>Nakladnoy ID:</b> #${invoiceId}\n` +
        `🔢 <b>Mavjud slot:</b> ${openSlots.length} ta\n` +
        `${slotsList}\n` +
        `⚡ <i>Bron qilish uchun quyidagi tugmani bosing!</i>`;

      return { hasSlot: true, message, timeFrom: firstSlot.timeFrom, openSlots };
    } catch (err) {
      this.logger.error(`findOpenSlotInfo error for shopId ${shopId}`, err);
      return null;
    }
  }

  private async checkSlotsForShop(token: string, shopId: number, shopName: string) {
    // Background cron job faqat 3 kun ichidagi slotlarni tekshiradi
    const info = await this.findOpenSlotInfo(token, shopId, 3, shopName);
    
    if (!this.botState.shopAlerts) this.botState.shopAlerts = {};
    const state = this.botState.shopAlerts[shopId] || { hasSlot: false, isInteracting: false };

    // Interaction Check - agar foydalanuvchi "Bron qilish" bosgan bo'lsa va timeout o'tmagan bo'lsa
    const now = Date.now();
    if (state.isInteracting && state.interactionUntil && state.interactionUntil > now) {
        return; // Skip, edit qilinmay turadi
    }
    if (state.isInteracting) {
        state.isInteracting = false; // Expired
    }

    const hasSlot = info ? info.hasSlot : false;
    let nextStateHasSlot = hasSlot;
    
    let textToSend = '';
    let keyboard = undefined;

    if (hasSlot && info?.message && info?.timeFrom) {
       const mentions = await this.getGroupMentions();
       const mentionHeader = mentions ? `🔔 <b>DIQQAT:</b> ${mentions}\n\n` : '';
       textToSend = mentionHeader + info.message;
       keyboard = {
         inline_keyboard: [
           [{ text: '📥 Bron qilish', callback_data: `book_start:${shopId}:${info.timeFrom}` }],
         ],
       };
    } else {
       textToSend = `🏬 <b>${shopName}</b>\n\n💤 <i>Yaqin orada slotlar mavjud emas, lekin uzoqroq muddatga olsa bo'ladi. (Sotuvchi paneli orqali tekshiring)</i>\n\n🔄 <i>Tekshirilgan vaqt: ${new Date().toLocaleTimeString('ru-RU', { timeZone: 'Asia/Tashkent' })}</i>`;
    }

    const isTransition = (state.hasSlot !== nextStateHasSlot);
    const shouldDeleteAndCreate = isTransition;

    if (shouldDeleteAndCreate || !state.messageId) {
        // Delete old
        if (state.messageId) {
            await this.deleteGroupMessage(state.messageId);
        }
        // Create new
        try {
            const res = await this.sendToGroup(textToSend, keyboard ? { reply_markup: keyboard } : {});
            state.messageId = res.message_id;
        } catch (e) {
            this.logger.error(`Error sending alert for shop ${shopId}`, e);
        }
    } else {
        // Same state, just edit
        if (state.messageId) {
            try {
                await this.editGroupMessage(state.messageId, textToSend, keyboard ? { reply_markup: keyboard } : {});
            } catch (err: any) {
                if (err.response?.body?.description?.includes('message to edit not found')) {
                    const res = await this.sendToGroup(textToSend, keyboard ? { reply_markup: keyboard } : {});
                    state.messageId = res.message_id;
                }
            }
        }
    }

    state.hasSlot = nextStateHasSlot;
    this.botState.shopAlerts[shopId] = state;
    this.saveState();
  }

  /**
   * Tahrirlaydi (delete+create emas), faqat buttonlar bosilganda ishlatiladi
   */
  private async editAlertMessage(
    chatId: number | string,
    messageId: number,
    text: string,
    replyMarkup?: any,
  ) {
    try {
        await this.bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        });
    } catch (err) {
        this.logger.error('Failed to edit alert message', err);
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
        const shopId = Number(shopIdStr);
        if (this.botState.shopAlerts?.[shopId]) {
            this.botState.shopAlerts[shopId].isInteracting = true;
            this.botState.shopAlerts[shopId].interactionUntil = Date.now() + 3 * 60 * 1000; // 3 min
            this.saveState();
        }
        await this.showInvoiceSelection(chatId, messageId, shopId, Number(timeFromStr));
      } else if (data.startsWith('book_select:')) {
        const [, shopIdStr, timeFromStr, invoiceIdStr] = data.split(':');
        const shopId = Number(shopIdStr);
        const username = query.from?.username
          ? `@${query.from.username}`
          : query.from?.first_name || 'Foydalanuvchi';
        
        await this.performBooking(
          chatId,
          messageId,
          shopId,
          Number(timeFromStr),
          Number(invoiceIdStr),
          username,
        );
      } else if (data.startsWith('book_back:')) {
        const [, shopIdStr] = data.split(':');
        const shopId = Number(shopIdStr);
        if (this.botState.shopAlerts?.[shopId]) {
            this.botState.shopAlerts[shopId].isInteracting = false;
            this.saveState();
        }
        await this.backToSlotAlert(chatId, messageId, shopId);
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
      await this.editAlertMessage(chatId, messageId, `❌ <i>Uzum token topilmadi.</i>`);
      return;
    }

    try {
      const baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
      const headers = this.getAuthHeaders(token);

      const res = await fetch(
        `${baseUrl}/api/seller/shop/${shopId}/invoice?page=0&size=20`,
        { headers },
      );

      if (res.status === 401) {
         await this.refreshUzumToken();
         await this.editAlertMessage(
           chatId,
           messageId,
           `❌ <i>Sessiya eskirgan edi. Auto-login orqali token yangilandi. Iltimos, qayta urinib ko'ring.</i>`,
           { inline_keyboard: [[{ text: '⬅️ Ortga', callback_data: `book_back:${shopId}` }]] },
         );
         return;
      }

      if (!res.ok) {
        await this.editAlertMessage(
          chatId,
          messageId,
          `❌ <i>Nakladnoylarni olishda xatolik yuz berdi.</i>`,
          { inline_keyboard: [[{ text: '⬅️ Ortga', callback_data: `book_back:${shopId}` }]] },
        );
        return;
      }

      const rawInvoices = await res.json();
      const invoices = rawInvoices?.payload ? rawInvoices.payload : rawInvoices;
      const bookable = (Array.isArray(invoices) ? invoices : []).filter(
        (inv: any) => inv.invoiceStatus?.value === 'CREATED',
      );

      if (bookable.length === 0) {
        await this.editAlertMessage(
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

      await this.editAlertMessage(chatId, messageId, text, { inline_keyboard: buttons });
    } catch (err) {
      this.logger.error(`showInvoiceSelection error for shopId ${shopId}`, err);
      await this.editAlertMessage(chatId, messageId, `❌ <i>Xatolik yuz berdi.</i>`);
    }
  }

  /**
   * "Ortga" bosilganda: shop uchun joriy erkin slotni qayta tekshirib,
   * yana "Bron qilish" tugmasi bilan alert xabarini qaytaradi.
   */
  private async backToSlotAlert(chatId: number, messageId: number, shopId: number) {
    const token = await this.getUzumToken();
    const shop = await this.prisma.shop.findFirst({ where: { uzumShopId: shopId } });
    if (!token || !shop) {
      await this.editAlertMessage(chatId, messageId, `❌ <i>Uzum token yoki do'kon topilmadi.</i>`);
      return;
    }

    await this.checkSlotsForShop(token, shopId, shop.name);
  }

  /**
   * Tanlangan nakladnoy uchun time-slot bron qilish so'rovini yuboradi
   * va natijani (muvaffaqiyatli/xatolik) xabarni tahrirlash orqali chiqaradi.
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
      await this.editAlertMessage(chatId, messageId, `❌ <i>Uzum token topilmadi.</i>`);
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

      if (res.status === 401) {
         await this.refreshUzumToken();
         await this.editAlertMessage(chatId, messageId, `❌ <i>Sessiya muddati tugagan edi. Auto-login orqali token yangilandi. Iltimos, qaytadan bron qilib ko'ring.</i>`, { inline_keyboard: [[{ text: '⬅️ Ortga', callback_data: `book_back:${shopId}` }]] });
         return;
      }

      const resultData = await res.json().catch(() => null);

      if (res.ok) {
        const text =
          `<b>✅ Muvaffaqiyatli bron qilindi!</b> 🎉\n\n` +
          `📦 <b>Nakladnoy ID:</b> #${invoiceId}\n` +
          `👤 <b>Bron qildi:</b> ${username}\n` +
          `🕒 <b>Vaqti:</b> ${new Date(timeFrom).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}`;
        await this.editAlertMessage(chatId, messageId, text);
        this.logger.log(`Booking success for invoice ${invoiceId} by ${username}`);

        // Keep interaction lock for 15 seconds so cron doesn't overwrite it immediately
        if (this.botState.shopAlerts?.[shopId]) {
          this.botState.shopAlerts[shopId].interactionUntil = Date.now() + 15 * 1000;
          this.saveState();
        }
      } else {
        const errMsg = resultData?.message || resultData?.error || `HTTP ${res.status}`;
        const text =
          `<b>❌ Bron qilishda xatolik!</b>\n\n` +
          `📦 <b>Nakladnoy ID:</b> #${invoiceId}\n` +
          `👤 <b>Urinish:</b> ${username}\n` +
          `⚠️ <b>Xato:</b> ${errMsg}`;
        await this.editAlertMessage(chatId, messageId, text, {
          inline_keyboard: [[{ text: '⬅️ Ortga', callback_data: `book_back:${shopId}` }]],
        });
      }
    } catch (err) {
      this.logger.error(`performBooking error for invoice ${invoiceId}`, err);
      await this.editAlertMessage(chatId, messageId, `❌ <i>Bron qilishda xatolik yuz berdi.</i>`);
    }
  }

  private async buildMainDashboardMessage(): Promise<string> {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));
    
    const todayYear = new Date();
    const startOfYear = new Date(todayYear.getFullYear(), 0, 1);
    const endOfYear = new Date(todayYear.getFullYear(), 11, 31, 23, 59, 59, 999);

    const nowStr = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' }).replace(',', '');

    const shops = await this.prisma.shop.findMany();
    const mentions = await this.getGroupMentions();
    const mentionHeader = mentions ? `${mentions}\n` : '';
    
    let message = `<b>📊 🌟 UZUM ERP DASHBOARD 🌟</b>\n`;
    message += mentionHeader;
    message += `<i>Hisobotlar yangilandi!</i>\n\n`;

    let totalDailyRevenue = 0;
    let totalDailyOrders = 0;
    let totalYearlyRevenue = 0;
    let totalYearlyOrders = 0;

    for (const shop of shops) {
      // Daily
      const dailyOrders = await this.prisma.order.count({
        where: { shopId: shop.uzumShopId, orderedAt: { gte: startOfDay, lte: endOfDay } }
      });
      const dailyRevAgg = await this.prisma.order.aggregate({
        where: { shopId: shop.uzumShopId, orderedAt: { gte: startOfDay, lte: endOfDay } },
        _sum: { sellPrice: true }
      });
      const dailyRev = dailyRevAgg._sum?.sellPrice || 0;

      // Yearly
      const yearlyOrders = await this.prisma.order.count({
        where: { shopId: shop.uzumShopId, orderedAt: { gte: startOfYear, lte: endOfYear } }
      });
      const yearlyRevAgg = await this.prisma.order.aggregate({
        where: { shopId: shop.uzumShopId, orderedAt: { gte: startOfYear, lte: endOfYear } },
        _sum: { sellPrice: true }
      });
      const yearlyRev = yearlyRevAgg._sum?.sellPrice || 0;

      totalDailyRevenue += dailyRev;
      totalDailyOrders += dailyOrders;
      totalYearlyRevenue += yearlyRev;
      totalYearlyOrders += yearlyOrders;

      message += `🏬 <b>${shop.name}</b>\n`;
      message += ` ├ 🌞 <b>Kunlik:</b> ${new Intl.NumberFormat('uz-UZ').format(dailyRev)} so'm 📦(${dailyOrders} ta)\n`;
      message += ` └ 🗓 <b>Yillik:</b> ${new Intl.NumberFormat('uz-UZ').format(yearlyRev)} so'm 📦(${yearlyOrders} ta)\n\n`;
    }

    message += `🌍 <b>🏆 UMUMIY NATIJALAR 🏆</b>\n`;
    message += ` ├ 💰 <b>Jami Kunlik:</b> ${new Intl.NumberFormat('uz-UZ').format(totalDailyRevenue)} so'm 📦(${totalDailyOrders} ta)\n`;
    message += ` └ 💎 <b>Jami Yillik:</b> ${new Intl.NumberFormat('uz-UZ').format(totalYearlyRevenue)} so'm 📦(${totalYearlyOrders} ta)\n\n`;
    
    const unreadReviewsCount = await this.prisma.review.count({ where: { isRead: false } });
    if (unreadReviewsCount > 0) {
        message += `⚠️ <b>Diqqat!</b> ${unreadReviewsCount} ta o'qilmagan sharh bor!\n\n`;
    }

    message += `🔄 <i>Tekshirilgan vaqt: ${nowStr}</i>`;

    return message;
  }

  private async buildOpenSlotsMessage(): Promise<string> {
    const token = await this.getUzumToken();
    if (!token) {
      return `<b>🕒 TIME-SLOT MONITORING</b>\n\n❌ <i>Uzum token topilmadi. Avval login qiling.</i>`;
    }

    const shops = await this.prisma.shop.findMany({ take: 5 });
    if (!shops.length) {
      return `<b>🕒 TIME-SLOT MONITORING</b>\n\n❌ <i>Do'konlar topilmadi.</i>`;
    }

    let message = `<b>🎯 BARCHA OCHIQ TIME-SLOTLAR (TOP 3)</b>\n\n`;
    const nowStr = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' }).replace(',', '');
    
    for (const shop of shops) {
      message += `🏬 <b>${shop.name || 'Ombor'}</b>\n`;
      
      const info = await this.findOpenSlotInfo(token, shop.uzumShopId, undefined, shop.name);
      if (info && info.openSlots && info.openSlots.length > 0) {
        info.openSlots.slice(0, 3).forEach((s, i) => {
            const sFrom = new Date(s.timeFrom);
            const sTo = new Date(s.timeTo);
            const sDateStr = sFrom.toLocaleDateString('ru-RU', { timeZone: 'Asia/Tashkent' });
            const sFromTime = sFrom.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
            const sToTime = sTo.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
            message += `  ${i === 0 ? '🔥' : '✅'} <b>${sDateStr}</b> ${sFromTime} - ${sToTime}\n`;
        });
        if (info.openSlots.length > 3) {
           message += `  └ ... va yana ${info.openSlots.length - 3} ta slot\n`;
        }
      } else {
        message += `  ❌ <i>Hozircha ochiq slot yo'q.</i>\n`;
      }
      message += `\n`;
    }

    message += `🔄 <i>Tekshirilgan vaqt: ${nowStr}</i>`;
    return message;
  }
}