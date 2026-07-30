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
var ShopsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShopsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../core/prisma/prisma.service");
const uzum_auth_service_1 = require("../uzum-integration/uzum-auth/uzum-auth.service");
let ShopsService = ShopsService_1 = class ShopsService {
    prisma;
    uzumAuthService;
    logger = new common_1.Logger(ShopsService_1.name);
    constructor(prisma, uzumAuthService) {
        this.prisma = prisma;
        this.uzumAuthService = uzumAuthService;
    }
    async getUserShops(userId) {
        let permissions = await this.prisma.shopPermission.findMany({
            where: { userId },
        });
        if (permissions.length === 0) {
            const user = await this.prisma.user.findUnique({ where: { id: userId } });
            if (user && user.uzumToken) {
                this.logger.log(`No local shops for user ${userId}, triggering Uzum API shop sync...`);
                await this.uzumAuthService.syncShopsForUser(user.id, user.uzumToken);
                permissions = await this.prisma.shopPermission.findMany({ where: { userId } });
            }
        }
        if (permissions.length > 0) {
            const uzumShopIds = permissions.map((p) => p.shopId);
            return this.prisma.shop.findMany({
                where: { uzumShopId: { in: uzumShopIds } },
            });
        }
        return this.prisma.shop.findMany();
    }
};
exports.ShopsService = ShopsService;
exports.ShopsService = ShopsService = ShopsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        uzum_auth_service_1.UzumAuthService])
], ShopsService);
//# sourceMappingURL=shops.service.js.map