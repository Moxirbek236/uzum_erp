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
var FboInvoicesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FboInvoicesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../core/prisma/prisma.service");
let FboInvoicesService = FboInvoicesService_1 = class FboInvoicesService {
    prisma;
    logger = new common_1.Logger(FboInvoicesService_1.name);
    baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getUzumToken() {
        const firstUser = await this.prisma.user.findFirst({
            where: { uzumToken: { not: null } },
        });
        return firstUser?.uzumToken || null;
    }
    getAuthHeaders(token) {
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
        return headers;
    }
    async syncFboInvoices() {
        this.logger.log('Starting FBO Invoices sync...');
        const token = await this.getUzumToken();
        if (!token) {
            this.logger.warn('No Uzum token found. Cannot sync invoices.');
            return { success: false, message: 'Token topilmadi' };
        }
        const shops = await this.prisma.shop.findMany();
        if (!shops.length) {
            return { success: false, message: 'Do\'konlar topilmadi' };
        }
        const headers = this.getAuthHeaders(token);
        let syncedCount = 0;
        for (const shop of shops) {
            try {
                const response = await fetch(`${this.baseUrl}/api/seller/shop/${shop.uzumShopId}/invoice?page=0&size=50`, {
                    headers,
                });
                if (!response.ok) {
                    this.logger.error(`Failed to fetch FBO invoices for shop ${shop.uzumShopId}: ${response.statusText}`);
                    continue;
                }
                const invoicesData = await response.json();
                for (const item of invoicesData) {
                    const invoiceId = item.id;
                    if (!invoiceId)
                        continue;
                    await this.prisma.invoice.upsert({
                        where: { id: invoiceId },
                        create: {
                            id: invoiceId,
                            shopId: shop.uzumShopId,
                            status: item.status || 'UNKNOWN',
                            stockTitle: item.stock?.title || '',
                            poolSource: item.stock?.poolSource || '',
                            timeSlotFrom: item.timeSlotReservation?.timeFrom ? new Date(item.timeSlotReservation.timeFrom) : null,
                            timeSlotTo: item.timeSlotReservation?.timeTo ? new Date(item.timeSlotReservation.timeTo) : null,
                            boxCount: item.boxCount || 0,
                            itemsCount: item.itemsCount || 0,
                            rawData: item,
                        },
                        update: {
                            status: item.status || 'UNKNOWN',
                            timeSlotFrom: item.timeSlotReservation?.timeFrom ? new Date(item.timeSlotReservation.timeFrom) : null,
                            timeSlotTo: item.timeSlotReservation?.timeTo ? new Date(item.timeSlotReservation.timeTo) : null,
                            boxCount: item.boxCount || 0,
                            itemsCount: item.itemsCount || 0,
                            rawData: item,
                        },
                    });
                    syncedCount++;
                }
            }
            catch (err) {
                this.logger.error(`Error syncing FBO invoices for shop ${shop.uzumShopId}`, err);
            }
        }
        this.logger.log(`FBO Invoices sync completed. Synced ${syncedCount} invoices.`);
        return { success: true, count: syncedCount };
    }
    async getInvoices(shopId, page = 1, size = 20) {
        const where = shopId ? { shopId } : {};
        const [total, data] = await Promise.all([
            this.prisma.invoice.count({ where }),
            this.prisma.invoice.findMany({
                where,
                orderBy: { id: 'desc' },
                skip: (page - 1) * size,
                take: size,
            }),
        ]);
        return {
            data,
            total,
            page,
            size,
        };
    }
};
exports.FboInvoicesService = FboInvoicesService;
exports.FboInvoicesService = FboInvoicesService = FboInvoicesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FboInvoicesService);
//# sourceMappingURL=fbo-invoices.service.js.map