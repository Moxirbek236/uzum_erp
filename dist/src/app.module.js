"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const auth_module_1 = require("./modules/auth/auth.module");
const uzum_integration_module_1 = require("./modules/uzum-integration/uzum-integration.module");
const reviews_module_1 = require("./modules/reviews/reviews.module");
const shops_module_1 = require("./modules/shops/shops.module");
const analytics_module_1 = require("./modules/analytics/analytics.module");
const bot_module_1 = require("./modules/bot/bot.module");
const socket_gateway_module_1 = require("./modules/socket-gateway/socket-gateway.module");
const bullmq_1 = require("@nestjs/bullmq");
const schedule_1 = require("@nestjs/schedule");
const prisma_module_1 = require("./core/prisma/prisma.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
const products_module_1 = require("./modules/products/products.module");
const finance_module_1 = require("./modules/finance/finance.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
            bullmq_1.BullModule.forRoot({
                connection: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: Number(process.env.REDIS_PORT) || 6379,
                },
            }),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            uzum_integration_module_1.UzumIntegrationModule,
            reviews_module_1.ReviewsModule,
            shops_module_1.ShopsModule,
            analytics_module_1.AnalyticsModule,
            notifications_module_1.NotificationsModule,
            products_module_1.ProductsModule,
            finance_module_1.FinanceModule,
            bot_module_1.BotModule,
            socket_gateway_module_1.SocketGatewayModule
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map