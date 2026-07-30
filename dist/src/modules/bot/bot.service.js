"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var BotService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../core/prisma/prisma.service");
const TelegramBot = require('node-telegram-bot-api');
let BotService = BotService_1 = class BotService {
    prisma;
    logger = new common_1.Logger(BotService_1.name);
    bot = null;
    botToken = process.env.TELEGRAM_BOT_TOKEN;
    groupChatId = process.env.TELEGRAM_GROUP_ID || '5157263324';
    constructor(prisma) {
        this.prisma = prisma;
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
            this.bot.onText(/\/report/, async (msg) => {
                const reportMsg = await this.buildDailyReportMessage();
                this.bot?.sendMessage(msg.chat.id, reportMsg, { parse_mode: 'HTML' });
            });
            this.bot.onText(/\/slots/, async (msg) => {
                const slotsMsg = await this.buildSlotsMessage();
                this.bot?.sendMessage(msg.chat.id, slotsMsg, { parse_mode: 'HTML' });
            });
            this.bot.onText(/\/stats/, async (msg) => {
                const statsMsg = await this.buildStatsMessage();
                this.bot?.sendMessage(msg.chat.id, statsMsg, { parse_mode: 'HTML' });
            });
            this.logger.log(`Telegram Bot initialized successfully. Target Group ID: ${this.groupChatId}`);
        }
        catch (err) {
            this.logger.error('Failed to initialize Telegram Bot polling', err);
        }
    }
    async sendGroupNotification(text, targetChatId) {
        const chatId = targetChatId || this.groupChatId;
        if (!chatId) {
            this.logger.warn('No Telegram Group ID configured.');
            return false;
        }
        try {
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId.startsWith('-') || chatId.length > 10 ? chatId : `-${chatId}`,
                    text: text,
                    parse_mode: 'HTML',
                }),
            });
            if (!res.ok) {
                const fallbackRes = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: text,
                        parse_mode: 'HTML',
                    }),
                });
                return fallbackRes.ok;
            }
            return true;
        }
        catch (err) {
            this.logger.error('Failed sending Telegram group message', err);
            return false;
        }
    }
    async handleDailyReportCron() {
        this.logger.log('Running Daily Report Cron Job for Telegram...');
        const message = await this.buildDailyReportMessage();
        await this.sendGroupNotification(message);
    }
    async handleMonthlyReportCron() {
        this.logger.log('Running Monthly Report Cron Job for Telegram...');
        const message = await this.buildMonthlyReportMessage();
        await this.sendGroupNotification(message);
    }
    async handleSlotMonitoringCron() {
        const firstUser = await this.prisma.user.findFirst({
            where: { uzumToken: { not: null } },
        });
        if (!firstUser?.uzumToken) {
            return;
        }
        const shops = await this.prisma.shop.findMany({
            take: 5,
        });
        if (!shops.length)
            return;
        for (const shop of shops) {
            await this.checkSlotsForShop(firstUser.uzumToken, shop.uzumShopId);
        }
    }
    async checkSlotsForShop(token, shopId) {
        try {
            const baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
            const headers = {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            };
            if (token.includes('=')) {
                headers['Cookie'] = token;
            }
            else {
                headers['Authorization'] = `Bearer ${token}`;
            }
            const invoiceRes = await fetch(`${baseUrl}/api/seller/shop/${shopId}/invoice?page=0&size=1`, { headers });
            if (!invoiceRes.ok)
                return;
            const invoices = await invoiceRes.json();
            if (!invoices || invoices.length === 0)
                return;
            const latestInvoice = invoices[0];
            const invoiceId = latestInvoice.id;
            const stockTitle = latestInvoice.stock?.title || 'Ombor';
            const stockAddress = latestInvoice.stock?.address || '';
            const poolSource = latestInvoice.stock?.poolSource || 'FULLFILMENT';
            const slotRes = await fetch(`${baseUrl}/api/seller/shop/${shopId}/v2/invoice/time-slot/get`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    invoiceIds: [invoiceId],
                    poolSource: poolSource,
                    timeFrom: Date.now(),
                }),
            });
            if (!slotRes.ok)
                return;
            const slotData = await slotRes.json();
            const timeSlots = slotData?.payload?.timeSlots || [];
            if (timeSlots.length === 0)
                return;
            const reservedFrom = latestInvoice.timeSlotReservation?.timeFrom;
            const now = Date.now();
            const rangeEnd = now + 3 * 24 * 60 * 60 * 1000;
            const openSlots = timeSlots.filter((s) => s.timeFrom !== reservedFrom &&
                s.timeFrom >= now &&
                s.timeFrom <= rangeEnd);
            if (openSlots.length === 0)
                return;
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
            const slotMessage = `<b>🚨 ERKIN TIME-SLOT TOPILDI!</b>\n\n` +
                `🏬 <b>Ombor:</b> ${stockTitle}\n` +
                `📍 <b>Manzil:</b> ${stockAddress}\n` +
                `📅 <b>Sana:</b> ${dateStr}\n` +
                `🕒 <b>Vaqt:</b> ${fromTime} - ${toTime}\n` +
                `📦 <b>Nakladnoy ID:</b> #${invoiceId}\n` +
                `🔢 <b>Mavjud slot:</b> ${openSlots.length} ta\n\n` +
                `⚡ <i>Uzum Seller panelidan zudlik bilan bron qiling!</i>`;
            await this.sendGroupNotification(slotMessage);
            this.logger.log(`Time-slot alert sent for shop ${shopId}, invoice ${invoiceId}, slot ${dateStr} ${fromTime}`);
        }
        catch (err) {
            this.logger.error(`checkSlotsForShop error for shopId ${shopId}`, err);
        }
    }
    async buildDailyReportMessage() {
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
    async buildMonthlyReportMessage() {
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
    async buildSlotsMessage() {
        const firstUser = await this.prisma.user.findFirst({
            where: { uzumToken: { not: null } },
        });
        if (!firstUser?.uzumToken) {
            return `<b>🕒 TIME-SLOT MONITORING HOLATI</b>\n\n❌ <i>Uzum token topilmadi. Avval login qiling.</i>`;
        }
        const shops = await this.prisma.shop.findMany({ take: 5 });
        if (!shops.length) {
            return `<b>🕒 TIME-SLOT MONITORING HOLATI</b>\n\n❌ <i>Do'konlar topilmadi.</i>`;
        }
        const baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
        const token = firstUser.uzumToken;
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };
        if (token.includes('=')) {
            headers['Cookie'] = token;
        }
        else {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const lines = [`<b>🕒 TIME-SLOT MONITORING HOLATI</b>\n`];
        for (const shop of shops) {
            try {
                const invoiceRes = await fetch(`${baseUrl}/api/seller/shop/${shop.uzumShopId}/invoice?page=0&size=1`, { headers });
                if (!invoiceRes.ok)
                    continue;
                const invoices = await invoiceRes.json();
                if (!invoices || invoices.length === 0)
                    continue;
                const latestInvoice = invoices[0];
                const invoiceId = latestInvoice.id;
                const stockTitle = latestInvoice.stock?.title || 'Ombor';
                const poolSource = latestInvoice.stock?.poolSource || 'FULLFILMENT';
                const reservedFrom = latestInvoice.timeSlotReservation?.timeFrom;
                const slotRes = await fetch(`${baseUrl}/api/seller/shop/${shop.uzumShopId}/v2/invoice/time-slot/get`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        invoiceIds: [invoiceId],
                        poolSource: poolSource,
                        timeFrom: latestInvoice.timeSlotReservation.timeFrom,
                    }),
                });
                if (!slotRes.ok)
                    continue;
                const slotData = await slotRes.json();
                const timeSlots = slotData?.payload?.timeSlots || [];
                const openSlots = timeSlots.filter((s) => s.timeFrom !== reservedFrom);
                lines.push(`🏬 <b>${shop.name || stockTitle}</b>`);
                if (openSlots.length === 0) {
                    lines.push(`  ├ Erkin slot yo'q\n`);
                }
                else {
                    openSlots.slice(0, 3).forEach((s, i) => {
                        const from = new Date(s.timeFrom);
                        const to = new Date(s.timeTo);
                        const dateStr = from.toLocaleDateString('uz-UZ', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                        });
                        const fromTime = from.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
                        const toTime = to.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
                        const prefix = i === openSlots.slice(0, 3).length - 1 ? '  └' : '  ├';
                        lines.push(`${prefix} ✅ ${dateStr} ${fromTime} - ${toTime}`);
                    });
                    if (openSlots.length > 3) {
                        lines.push(`  └ ... va yana ${openSlots.length - 3} ta slot\n`);
                    }
                    else {
                        lines.push('');
                    }
                }
            }
            catch {
                lines.push(`🏬 <b>${shop.name}</b>: Ma'lumot olib bo'lmadi\n`);
            }
        }
        lines.push(`⚡ <i>Erkin o'rinlar har 1 daqiqada tekshirib turiladi.</i>`);
        return lines.join('\n');
    }
    async buildStatsMessage() {
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
};
exports.BotService = BotService;
__decorate([
    (0, schedule_1.Cron)('0 23 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BotService.prototype, "handleDailyReportCron", null);
__decorate([
    (0, schedule_1.Cron)('0 0 1 * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BotService.prototype, "handleMonthlyReportCron", null);
__decorate([
    (0, schedule_1.Cron)('*/1 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BotService.prototype, "handleSlotMonitoringCron", null);
exports.BotService = BotService = BotService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], BotService);
//# sourceMappingURL=bot.service.js.map