"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UzumIntegrationModule = void 0;
const common_1 = require("@nestjs/common");
const uzum_auth_service_1 = require("./uzum-auth/uzum-auth.service");
const uzum_shop_service_1 = require("./uzum-shop/uzum-shop.service");
const uzum_review_service_1 = require("./uzum-review/uzum-review.service");
let UzumIntegrationModule = class UzumIntegrationModule {
};
exports.UzumIntegrationModule = UzumIntegrationModule;
exports.UzumIntegrationModule = UzumIntegrationModule = __decorate([
    (0, common_1.Module)({
        providers: [uzum_auth_service_1.UzumAuthService, uzum_shop_service_1.UzumShopService, uzum_review_service_1.UzumReviewService],
        exports: [uzum_auth_service_1.UzumAuthService, uzum_shop_service_1.UzumShopService, uzum_review_service_1.UzumReviewService],
    })
], UzumIntegrationModule);
//# sourceMappingURL=uzum-integration.module.js.map