"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FboInvoicesModule = void 0;
const common_1 = require("@nestjs/common");
const fbo_invoices_service_1 = require("./fbo-invoices.service");
const fbo_invoices_controller_1 = require("./fbo-invoices.controller");
let FboInvoicesModule = class FboInvoicesModule {
};
exports.FboInvoicesModule = FboInvoicesModule;
exports.FboInvoicesModule = FboInvoicesModule = __decorate([
    (0, common_1.Module)({
        controllers: [fbo_invoices_controller_1.FboInvoicesController],
        providers: [fbo_invoices_service_1.FboInvoicesService],
        exports: [fbo_invoices_service_1.FboInvoicesService],
    })
], FboInvoicesModule);
//# sourceMappingURL=fbo-invoices.module.js.map