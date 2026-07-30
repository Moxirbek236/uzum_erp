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
var NotificationsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../core/prisma/prisma.service");
let NotificationsService = NotificationsService_1 = class NotificationsService {
    prisma;
    logger = new common_1.Logger(NotificationsService_1.name);
    baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getUnreadCount(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user || !user.uzumToken) {
            return { unreadCount: 0 };
        }
        try {
            const headers = {
                'Accept': 'application/json',
            };
            if (user.uzumToken.includes('=')) {
                headers['Cookie'] = user.uzumToken;
            }
            else {
                headers['Authorization'] = `Bearer ${user.uzumToken}`;
            }
            const res = await fetch(`${this.baseUrl}/api/v1/seller/notification/unread-count`, {
                method: 'GET',
                headers,
            });
            if (res.ok) {
                const data = await res.json();
                return { unreadCount: data?.unreadCount || 0 };
            }
            this.logger.warn(`Uzum notification API returned status ${res.status}`);
            return { unreadCount: 0 };
        }
        catch (err) {
            this.logger.error('Failed to fetch unread notifications count from Uzum API', err);
            return { unreadCount: 0 };
        }
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = NotificationsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map