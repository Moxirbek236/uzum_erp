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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotController = void 0;
const common_1 = require("@nestjs/common");
const bot_service_1 = require("./bot.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
let BotController = class BotController {
    botService;
    constructor(botService) {
        this.botService = botService;
    }
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
    async sendTestMessage(text) {
        const defaultMsg = `<b>⚡ Uzum ERP Bot Test Xabari!</b>\n\n` +
            `Telegram guruh (${process.env.TELEGRAM_GROUP_ID || '5157263324'}) bilan aloqa muvaffaqiyatli o'rnatildi! ✅`;
        const success = await this.botService.sendGroupNotification(text || defaultMsg);
        return { success, message: success ? 'Xabar Telegram guruhga yuborildi!' : 'Xabar yuborishda xatolik' };
    }
    async triggerDailyReport() {
        await this.botService.handleDailyReportCron();
        return { success: true, message: 'Kunlik hisobot Telegram guruhga yuborildi!' };
    }
};
exports.BotController = BotController;
__decorate([
    (0, common_1.Get)('status'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BotController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Post)('test-message'),
    __param(0, (0, common_1.Body)('text')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BotController.prototype, "sendTestMessage", null);
__decorate([
    (0, common_1.Post)('trigger-daily-report'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BotController.prototype, "triggerDailyReport", null);
exports.BotController = BotController = __decorate([
    (0, common_1.Controller)('bot'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [bot_service_1.BotService])
], BotController);
//# sourceMappingURL=bot.controller.js.map