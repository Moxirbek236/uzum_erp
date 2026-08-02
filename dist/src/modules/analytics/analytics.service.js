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
var AnalyticsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../core/prisma/prisma.service");
const reviews_service_1 = require("../reviews/reviews.service");
const products_service_1 = require("../products/products.service");
const finance_service_1 = require("../finance/finance.service");
const uzum_auth_service_1 = require("../uzum-integration/uzum-auth/uzum-auth.service");
let AnalyticsService = AnalyticsService_1 = class AnalyticsService {
    prisma;
    reviewsService;
    productsService;
    financeService;
    uzumAuthService;
    constructor(prisma, reviewsService, productsService, financeService, uzumAuthService) {
        this.prisma = prisma;
        this.reviewsService = reviewsService;
        this.productsService = productsService;
        this.financeService = financeService;
        this.uzumAuthService = uzumAuthService;
    }
    logger = new common_1.Logger(AnalyticsService_1.name);
    async handleDailySync() {
        this.logger.log('Starting automated daily Uzum API sync for all active users...');
        try {
            const users = await this.prisma.user.findMany({
                where: { uzumToken: { not: null } },
            });
            for (const user of users) {
                this.logger.log(`Syncing data for user ${user.id}...`);
                await this.triggerUzumSync(user.id);
            }
            this.logger.log('Automated daily Uzum API sync completed successfully.');
        }
        catch (err) {
            this.logger.error('Error during automated daily Uzum API sync:', err);
        }
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
        await this.financeService.syncFinanceDataFromUzum(token);
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
        const successfulOrders = await this.prisma.order.count({
            where: { ...whereShop, status: 'TO_WITHDRAW' }
        });
        const canceledOrders = await this.prisma.order.count({
            where: { ...whereShop, status: 'CANCELED' }
        });
        const processingOrders = await this.prisma.order.count({
            where: { ...whereShop, status: 'PROCESSING' }
        });
        const financeSummariesAll = await this.prisma.financeSummary.findMany({
            where: whereShop,
        });
        let totalRevenue = 0;
        for (const fs of financeSummariesAll) {
            totalRevenue += fs.commonBalance;
        }
        const summaries = await this.prisma.financeSummary.findMany({
            where: whereShop,
            select: { salesChartData: true }
        });
        const salesChartMap = new Map();
        for (const summary of summaries) {
            if (summary.salesChartData && Array.isArray(summary.salesChartData)) {
                const chartData = summary.salesChartData;
                for (const item of chartData) {
                    const rawDate = item['Sales.created_at.day'];
                    const salesStr = item['Sales.gmv_purchased_after_returns_measure'];
                    if (rawDate && salesStr) {
                        const dateObj = new Date(rawDate);
                        const dateLabel = dateObj.toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' });
                        const val = parseFloat(salesStr);
                        const current = salesChartMap.get(dateLabel) || 0;
                        salesChartMap.set(dateLabel, current + val);
                    }
                }
            }
        }
        const salesChart = [];
        const today = new Date();
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateLabel = d.toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' });
            salesChart.push({
                date: dateLabel,
                sales: salesChartMap.get(dateLabel) || 0,
                orders: 0,
            });
        }
        const recentAlerts = [];
        const latestReviews = await this.prisma.review.findMany({
            where: { ...whereShop, isRead: false },
            orderBy: { createdAt: 'desc' },
            take: 3,
        });
        latestReviews.forEach((r, idx) => {
            recentAlerts.push({
                id: `rev-${r.id}`,
                type: 'review',
                title: 'Yangi sharh',
                message: `Mijoz mahsulotingizga baho berdi: ${r.rating} yulduz.`,
                time: r.createdAt.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
            });
        });
        if (lowStockProducts > 0) {
            recentAlerts.push({
                id: 'low-stock',
                type: 'inventory',
                title: 'Zaxira tugamoqda',
                message: `${lowStockProducts} ta mahsulot zaxirasi minimal darajaga yetdi.`,
                time: new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
            });
        }
        return {
            summary: {
                totalRevenue,
                revenueGrowth: 0,
                totalOrders,
                successfulOrders,
                canceledOrders,
                processingOrders,
                ordersGrowth: 0,
                totalProducts,
                lowStockProducts,
                unreadReviews,
                totalShops,
            },
            salesChart,
            recentAlerts,
        };
    }
};
exports.AnalyticsService = AnalyticsService;
__decorate([
    (0, schedule_1.Cron)('0 0,12 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AnalyticsService.prototype, "handleDailySync", null);
exports.AnalyticsService = AnalyticsService = AnalyticsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        reviews_service_1.ReviewsService,
        products_service_1.ProductsService,
        finance_service_1.FinanceService,
        uzum_auth_service_1.UzumAuthService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map