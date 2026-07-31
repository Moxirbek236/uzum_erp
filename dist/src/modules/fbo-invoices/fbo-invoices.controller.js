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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FboInvoicesController = void 0;
const common_1 = require("@nestjs/common");
const fbo_invoices_service_1 = require("./fbo-invoices.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
let FboInvoicesController = class FboInvoicesController {
    invoicesService;
    constructor(invoicesService) {
        this.invoicesService = invoicesService;
    }
    async getInvoices(shopId, page, size) {
        const sId = shopId ? parseInt(shopId, 10) : undefined;
        const p = page ? parseInt(page, 10) : 1;
        const s = size ? parseInt(size, 10) : 20;
        return this.invoicesService.getInvoices(sId, p, s);
    }
    async syncInvoices() {
        return this.invoicesService.syncFboInvoices();
    }
};
exports.FboInvoicesController = FboInvoicesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('shopId')),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('size')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], FboInvoicesController.prototype, "getInvoices", null);
__decorate([
    (0, common_1.Post)('sync'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FboInvoicesController.prototype, "syncInvoices", null);
exports.FboInvoicesController = FboInvoicesController = __decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('fbo-invoices'),
    __metadata("design:paramtypes", [fbo_invoices_service_1.FboInvoicesService])
], FboInvoicesController);
//# sourceMappingURL=fbo-invoices.controller.js.map