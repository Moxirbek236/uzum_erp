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
var UzumAuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UzumAuthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../core/prisma/prisma.service");
let UzumAuthService = UzumAuthService_1 = class UzumAuthService {
    prisma;
    logger = new common_1.Logger(UzumAuthService_1.name);
    baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
    financeUrl = process.env.UZUM_FINANCE_API_BASE || 'https://api.uzum.uz';
    constructor(prisma) {
        this.prisma = prisma;
    }
    async loginToUzum(identifier, password) {
        try {
            this.logger.log(`Attempting real Uzum login for ${identifier}`);
            const payload = new URLSearchParams({
                grant_type: 'password',
                username: identifier,
                password: password,
                client_id: 'b2b-front'
            });
            const response = await fetch(`${this.baseUrl}/api/oauth/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic YjJiLWZyb250OmNsaWVudFNlY3JldA==',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Origin': 'https://seller.uzum.uz',
                    'Referer': 'https://seller.uzum.uz/',
                    'Accept': 'application/json'
                },
                body: payload.toString(),
            });
            if (!response.ok) {
                this.logger.warn(`Uzum API login failed with status: ${response.status}`);
                return null;
            }
            let tokenStr = '';
            let isCookie = false;
            try {
                const data = await response.json();
                if (data && data.access_token) {
                    tokenStr = data.access_token;
                }
            }
            catch (e) {
            }
            if (!tokenStr) {
                const setCookie = response.headers.get('set-cookie');
                if (setCookie) {
                    tokenStr = setCookie;
                    isCookie = true;
                }
            }
            if (!tokenStr) {
                this.logger.warn('Uzum API login succeeded but no token/cookie found in response');
                return null;
            }
            const headersForVerification = {};
            if (isCookie) {
                headersForVerification['Cookie'] = tokenStr;
            }
            else {
                headersForVerification['Authorization'] = `Bearer ${tokenStr}`;
            }
            const verifyRes = await fetch(`${this.baseUrl}/api/seller/verification`, {
                method: 'GET',
                headers: headersForVerification,
            });
            if (verifyRes.ok) {
                this.logger.log(`Uzum Verification successful (200 OK) with ${isCookie ? 'Cookie' : 'Bearer'}`);
                return {
                    token: tokenStr,
                    name: identifier,
                };
            }
            const errorText = await verifyRes.text();
            this.logger.warn(`Uzum Verification failed (Not 200). Status: ${verifyRes.status}, Body: ${errorText}`);
            return null;
        }
        catch (error) {
            this.logger.error('Error logging into Uzum API', error);
            return null;
        }
    }
    async syncShopsForUser(userId, token) {
        try {
            this.logger.log(`Fetching shops from Uzum API for user ${userId}`);
            const headers = {
                'Accept': 'application/json',
            };
            if (token.includes('=')) {
                headers['Cookie'] = token;
            }
            else {
                headers['Authorization'] = `Bearer ${token}`;
            }
            let shopsData = [];
            try {
                const res = await fetch(`${this.financeUrl}/api/seller/shop/`, { headers });
                if (res.ok) {
                    const parsed = await res.json();
                    if (Array.isArray(parsed)) {
                        shopsData = parsed;
                    }
                }
            }
            catch (e) {
                this.logger.warn('Failed fetching /api/seller/shop/', e);
            }
            if (shopsData.length === 0) {
                try {
                    const checkRes = await fetch(`${this.baseUrl}/api/auth/seller/check_token`, {
                        method: 'POST',
                        headers: {
                            ...headers,
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: `token=${encodeURIComponent(token)}`,
                    });
                    if (checkRes.ok) {
                        const checkData = await checkRes.json();
                        const orgs = checkData?.organizations || {};
                        const orgIds = Object.keys(orgs);
                        for (const orgIdStr of orgIds) {
                            const shopId = parseInt(orgIdStr, 10);
                            if (!isNaN(shopId)) {
                                shopsData.push({
                                    id: shopId,
                                    shopTitle: `Do'kon #${shopId}`,
                                });
                            }
                        }
                    }
                }
                catch (e) {
                    this.logger.warn('Failed calling check_token for shops', e);
                }
            }
            if (shopsData.length > 0) {
                for (const shop of shopsData) {
                    const shopName = shop.shopTitle || shop.name || shop.title || `Do'kon #${shop.id}`;
                    await this.prisma.shop.upsert({
                        where: { uzumShopId: shop.id },
                        update: { name: shopName },
                        create: {
                            uzumShopId: shop.id,
                            name: shopName,
                        },
                    });
                    await this.prisma.shopPermission.upsert({
                        where: {
                            shopId_userId_permission: {
                                shopId: shop.id,
                                userId: userId,
                                permission: 'OWNER',
                            }
                        },
                        update: {},
                        create: {
                            shopId: shop.id,
                            userId: userId,
                            permission: 'OWNER',
                        }
                    });
                }
                this.logger.log(`Synced ${shopsData.length} shops from Uzum API for user ${userId}`);
            }
            else {
                this.logger.log(`No shops returned from Uzum API for user ${userId}`);
            }
        }
        catch (error) {
            this.logger.error('Failed to sync shops', error);
        }
    }
};
exports.UzumAuthService = UzumAuthService;
exports.UzumAuthService = UzumAuthService = UzumAuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UzumAuthService);
//# sourceMappingURL=uzum-auth.service.js.map