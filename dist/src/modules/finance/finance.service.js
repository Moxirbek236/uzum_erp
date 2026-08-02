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
var FinanceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinanceService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../core/prisma/prisma.service");
let FinanceService = FinanceService_1 = class FinanceService {
    prisma;
    logger = new common_1.Logger(FinanceService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getFinanceSummary(shopId, page = 0, size = 20) {
        const summaryWhere = shopId ? { shopId } : {};
        const ordersWhere = shopId ? { shopId } : {};
        const [summaries, totalOrders, orders] = await Promise.all([
            this.prisma.financeSummary.findMany({ where: summaryWhere }),
            this.prisma.order.count({ where: ordersWhere }),
            this.prisma.order.findMany({
                where: ordersWhere,
                orderBy: { updatedAt: 'desc' },
                skip: page * size,
                take: size,
            }),
        ]);
        let aggregatedSummary = {
            commonBalance: 0,
            returnsPerMonth: 0,
            regularWithdrawSum: 0,
            urgentWithdrawSum: 0,
            expenses: [],
        };
        for (const s of summaries) {
            aggregatedSummary.commonBalance += s.commonBalance || 0;
            aggregatedSummary.returnsPerMonth += s.returnsPerMonth || 0;
            aggregatedSummary.regularWithdrawSum += s.regularWithdrawSum || 0;
            aggregatedSummary.urgentWithdrawSum += s.urgentWithdrawSum || 0;
            if (s.expenses && Array.isArray(s.expenses)) {
                aggregatedSummary.expenses = [...aggregatedSummary.expenses, ...s.expenses];
            }
        }
        const mergedExpenses = aggregatedSummary.expenses.reduce((acc, curr) => {
            const existing = acc.find((e) => e.source === curr.source);
            if (existing) {
                existing.expended += curr.expended;
            }
            else {
                acc.push({ ...curr });
            }
            return acc;
        }, []);
        aggregatedSummary.expenses = mergedExpenses;
        return {
            summary: aggregatedSummary,
            orders: {
                total: totalOrders,
                page,
                size,
                items: orders,
            },
        };
    }
    async syncFinanceDataFromUzum(token) {
        try {
            this.logger.log('Starting sync of Uzum finance data...');
            const shops = await this.prisma.shop.findMany();
            if (shops.length === 0) {
                this.logger.warn('No shops found in DB to sync finance for.');
                return;
            }
            const baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            };
            if (token.includes('=')) {
                headers['Cookie'] = token;
            }
            else {
                headers['Authorization'] = `Bearer ${token}`;
            }
            const shopIds = shops.map((s) => s.uzumShopId).join(',');
            try {
                const infoUrl = `${baseUrl}/api/seller/finance/info?shopIds=${shopIds}`;
                const res = await fetch(infoUrl, { headers });
                if (res.ok) {
                    const data = await res.json();
                    const payload = data.payload || {};
                    const regularSum = payload.regularWithdrawInfo?.sum || 0;
                    const regularDate = payload.regularWithdrawInfo?.withdrawalDate || null;
                    const urgentAllowed = payload.urgentWithdrawInfo?.allowed || false;
                    const urgentSum = payload.urgentWithdrawInfo?.forWithdrawalSum || 0;
                    const balanceSum = payload.balanceStatisticInfo?.commonBalanceSum || 0;
                    const returnsSum = payload.balanceStatisticInfo?.returnsPerMonthSum || 0;
                    const expenses = payload.balanceStatisticInfo?.expensesStatementDetail?.expenses || [];
                    for (const shop of shops) {
                        const shopRes = await fetch(`${baseUrl}/api/seller/finance/info?shopIds=${shop.uzumShopId}`, { headers });
                        if (shopRes.ok) {
                            const sData = await shopRes.json();
                            const sPayload = sData.payload || {};
                            let salesChartData = null;
                            try {
                                const queryObj = {
                                    timezone: 'Asia/Tashkent',
                                    measures: ['Sales.gmv_purchased_after_returns_measure'],
                                    dimensions: ['Sales.shop_id'],
                                    timeDimensions: [
                                        {
                                            dimension: 'Sales.created_at',
                                            dateRange: 'from 30 days ago to now',
                                            granularity: 'day'
                                        }
                                    ],
                                    filters: [
                                        {
                                            member: 'Sales.shop_id',
                                            operator: 'equals',
                                            values: [String(shop.uzumShopId)]
                                        }
                                    ]
                                };
                                const encodedQuery = encodeURIComponent(JSON.stringify(queryObj));
                                const cubeUrl = `https://analytics-seller.uzum.uz/cubejs-api/v1/load?query=${encodedQuery}&queryType=multi`;
                                const cubeRes = await fetch(cubeUrl, { headers });
                                if (cubeRes.ok) {
                                    const cubeData = await cubeRes.json();
                                    if (cubeData.results && cubeData.results.length > 0) {
                                        salesChartData = cubeData.results[0].data;
                                    }
                                }
                            }
                            catch (e) {
                                this.logger.error(`Failed to fetch analytics for shop ${shop.uzumShopId}`, e);
                            }
                            await this.prisma.financeSummary.upsert({
                                where: { shopId: shop.uzumShopId },
                                update: {
                                    commonBalance: sPayload.balanceStatisticInfo?.commonBalanceSum || 0,
                                    returnsPerMonth: sPayload.balanceStatisticInfo?.returnsPerMonthSum || 0,
                                    regularWithdrawSum: sPayload.regularWithdrawInfo?.sum || 0,
                                    regularWithdrawalDate: sPayload.regularWithdrawInfo?.withdrawalDate || null,
                                    urgentWithdrawAllowed: sPayload.urgentWithdrawInfo?.allowed || false,
                                    urgentWithdrawSum: sPayload.urgentWithdrawInfo?.forWithdrawalSum || 0,
                                    expenses: sPayload.balanceStatisticInfo?.expensesStatementDetail?.expenses || [],
                                    salesChartData: salesChartData || undefined,
                                },
                                create: {
                                    shopId: shop.uzumShopId,
                                    commonBalance: sPayload.balanceStatisticInfo?.commonBalanceSum || 0,
                                    returnsPerMonth: sPayload.balanceStatisticInfo?.returnsPerMonthSum || 0,
                                    regularWithdrawSum: sPayload.regularWithdrawInfo?.sum || 0,
                                    regularWithdrawalDate: sPayload.regularWithdrawInfo?.withdrawalDate || null,
                                    urgentWithdrawAllowed: sPayload.urgentWithdrawInfo?.allowed || false,
                                    urgentWithdrawSum: sPayload.urgentWithdrawInfo?.forWithdrawalSum || 0,
                                    expenses: sPayload.balanceStatisticInfo?.expensesStatementDetail?.expenses || [],
                                    salesChartData: salesChartData || undefined,
                                }
                            });
                        }
                    }
                }
            }
            catch (e) {
                this.logger.error('Failed to sync finance info:', e);
            }
            for (const shop of shops) {
                try {
                    let page = 0;
                    let hasMore = true;
                    let synced = 0;
                    const size = 1000000;
                    while (hasMore) {
                        const ordersUrl = `${baseUrl}/api/seller/finance/orders?size=${size}&page=${page}&shopIds=${shop.uzumShopId}`;
                        const res = await fetch(ordersUrl, { headers });
                        if (!res.ok) {
                            hasMore = false;
                            break;
                        }
                        const data = await res.json();
                        const orderItems = data.orderItems || [];
                        if (orderItems.length === 0) {
                            hasMore = false;
                            break;
                        }
                        for (const item of orderItems) {
                            const orderIdStr = String(item.id);
                            await this.prisma.order.upsert({
                                where: { id: orderIdStr },
                                update: {
                                    status: item.status || 'COMPLETED',
                                    sellPrice: item.sellPrice || 0,
                                    sellerProfit: item.sellerProfit || 0,
                                    commission: item.commission || 0,
                                    purchasePrice: item.purchasePrice || 0,
                                    logisticDeliveryFee: item.logisticDeliveryFee || 0,
                                    amountReturns: item.amountReturns || 0,
                                    productTitle: item.productTitle || 'Unknown',
                                    orderedAt: item.date ? new Date(item.date) : null,
                                    uzumOrderId: item.orderId ? String(item.orderId) : null,
                                    skuTitle: item.skuTitle || null,
                                    productId: item.productId || null,
                                    photoKey: item.productImage?.photoKey || null,
                                    amount: item.amount || 1,
                                },
                                create: {
                                    id: orderIdStr,
                                    shopId: shop.uzumShopId,
                                    status: item.status || 'COMPLETED',
                                    sellPrice: item.sellPrice || 0,
                                    sellerProfit: item.sellerProfit || 0,
                                    commission: item.commission || 0,
                                    purchasePrice: item.purchasePrice || 0,
                                    logisticDeliveryFee: item.logisticDeliveryFee || 0,
                                    amountReturns: item.amountReturns || 0,
                                    productTitle: item.productTitle || 'Unknown',
                                    orderedAt: item.date ? new Date(item.date) : null,
                                    uzumOrderId: item.orderId ? String(item.orderId) : null,
                                    skuTitle: item.skuTitle || null,
                                    productId: item.productId || null,
                                    photoKey: item.productImage?.photoKey || null,
                                    amount: item.amount || 1,
                                }
                            });
                        }
                        synced += orderItems.length;
                        if (orderItems.length < size) {
                            hasMore = false;
                        }
                        else {
                            page++;
                        }
                    }
                    this.logger.log(`Synced ${synced} finance orders for shop ${shop.uzumShopId}`);
                }
                catch (e) {
                    this.logger.error(`Failed to sync finance orders for shop ${shop.uzumShopId}:`, e);
                }
            }
            this.logger.log(`Successfully synced finance data from Uzum API`);
        }
        catch (err) {
            this.logger.error('Error in syncFinanceDataFromUzum:', err);
        }
    }
};
exports.FinanceService = FinanceService;
exports.FinanceService = FinanceService = FinanceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FinanceService);
//# sourceMappingURL=finance.service.js.map