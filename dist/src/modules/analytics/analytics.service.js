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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../core/prisma/prisma.service");
const reviews_service_1 = require("../reviews/reviews.service");
const products_service_1 = require("../products/products.service");
const uzum_auth_service_1 = require("../uzum-integration/uzum-auth/uzum-auth.service");
let AnalyticsService = class AnalyticsService {
    prisma;
    reviewsService;
    productsService;
    uzumAuthService;
    constructor(prisma, reviewsService, productsService, uzumAuthService) {
        this.prisma = prisma;
        this.reviewsService = reviewsService;
        this.productsService = productsService;
        this.uzumAuthService = uzumAuthService;
    }
    async triggerUzumSync(userId) {
        let user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        let token = user?.uzumToken;
        if (!token) {
            const username = process.env.UZUM_USERNAME || user?.email || user?.phone;
            const password = process.env.UZUM_PASSWORD;
            if (username && password) {
                const uzumSession = await this.uzumAuthService.loginToUzum(username, password);
                if (uzumSession && uzumSession.token) {
                    token = uzumSession.token;
                    if (user) {
                        await this.prisma.user.update({
                            where: { id: user.id },
                            data: { uzumToken: token },
                        });
                    }
                }
            }
        }
        if (!token || !user) {
            return { success: false, message: 'Uzum session token not found. Please log in again.' };
        }
        await this.uzumAuthService.syncShopsForUser(user.id, token);
        await this.productsService.syncProductsFromUzum(token);
        await this.reviewsService.syncReviewsFromUzum(token);
        return { success: true, message: 'Uzum API sync completed successfully' };
    }
    async getDashboardSummary(shopId) {
        const whereShop = shopId ? { shopId } : {};
        const unreadReviews = await this.prisma.review.count({
            where: {
                ...whereShop,
                isRead: false,
            },
        });
        const totalShops = shopId
            ? 1
            : await this.prisma.shop.count();
        const totalProducts = await this.prisma.product.count({
            where: whereShop,
        });
        const lowStockProducts = await this.prisma.product.count({
            where: {
                ...whereShop,
                stock: { lte: 5 },
            },
        });
        const totalOrders = await this.prisma.order.count({
            where: whereShop,
        });
        const revenueAggregate = await this.prisma.order.aggregate({
            where: whereShop,
            _sum: {
                totalAmount: true,
            },
        });
        const totalRevenue = revenueAggregate._sum.totalAmount || 0;
        return {
            summary: {
                totalRevenue,
                revenueGrowth: 0,
                totalOrders,
                ordersGrowth: 0,
                totalProducts,
                lowStockProducts,
                unreadReviews,
                totalShops,
            },
            salesChart: [],
            recentAlerts: [],
        };
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        reviews_service_1.ReviewsService,
        products_service_1.ProductsService,
        uzum_auth_service_1.UzumAuthService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map