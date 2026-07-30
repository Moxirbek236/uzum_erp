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
var ProductsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../core/prisma/prisma.service");
let ProductsService = ProductsService_1 = class ProductsService {
    prisma;
    logger = new common_1.Logger(ProductsService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getProducts(shopId, page = 0, size = 10, search) {
        const where = {};
        if (shopId) {
            where.shopId = shopId;
        }
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [total, items] = await Promise.all([
            this.prisma.product.count({ where }),
            this.prisma.product.findMany({
                where,
                orderBy: { updatedAt: 'desc' },
                skip: page * size,
                take: size,
            }),
        ]);
        return {
            total,
            page,
            size,
            items,
        };
    }
    async syncProductsFromUzum(token) {
        try {
            this.logger.log('Starting sync of Uzum products...');
            const shops = await this.prisma.shop.findMany();
            if (shops.length === 0) {
                this.logger.warn('No shops found in DB to sync products for.');
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
            let totalSynced = 0;
            for (const shop of shops) {
                try {
                    const shopId = shop.uzumShopId;
                    this.logger.log(`Fetching products for shop ${shop.name} (${shopId})...`);
                    const url = `${baseUrl}/api/seller/shop/${shopId}/product/getProducts?page=0&size=1000&filter=ALL&sortBy=id&searchQuery=&order=descending`;
                    const res = await fetch(url, { headers });
                    if (!res.ok) {
                        const errBody = await res.text();
                        this.logger.error(`Failed to fetch products for shop ${shopId}. Status: ${res.status}. Body: ${errBody}`);
                        continue;
                    }
                    const data = await res.json();
                    const productList = data.productList || [];
                    this.logger.log(`Found ${productList.length} products to sync for shop ${shopId}`);
                    for (const item of productList) {
                        const uzumProductId = item.productId;
                        const title = item.title || 'No Title';
                        const sku = item.skuTitle || null;
                        const price = item.price || 0;
                        const stock = item.quantityAvailable || 0;
                        const imageUrl = item.image || null;
                        const previewImageUrl = item.previewImg || null;
                        const category = item.category || null;
                        const statusValue = item.status?.value || null;
                        const statusTitle = item.status?.title || null;
                        const statusColor = item.status?.color || null;
                        const skuList = item.skuList || [];
                        const hasMoreOneSku = skuList.length > 1;
                        await this.prisma.product.upsert({
                            where: { uzumProductId },
                            update: {
                                title,
                                sku,
                                price,
                                stock,
                                imageUrl,
                                previewImageUrl,
                                statusValue,
                                statusTitle,
                                statusColor,
                                category,
                                hasMoreOneSku,
                                skuList,
                            },
                            create: {
                                uzumProductId,
                                shopId,
                                title,
                                sku,
                                price,
                                stock,
                                imageUrl,
                                previewImageUrl,
                                statusValue,
                                statusTitle,
                                statusColor,
                                category,
                                hasMoreOneSku,
                                skuList,
                            },
                        });
                        totalSynced++;
                    }
                }
                catch (shopErr) {
                    this.logger.error(`Error syncing products for shop ${shop.name}:`, shopErr);
                }
            }
            this.logger.log(`Successfully synced ${totalSynced} products from Uzum API`);
        }
        catch (err) {
            this.logger.error('Error in syncProductsFromUzum:', err);
        }
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = ProductsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProductsService);
//# sourceMappingURL=products.service.js.map