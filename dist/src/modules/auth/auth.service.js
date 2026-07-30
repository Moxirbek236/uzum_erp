"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../core/prisma/prisma.service");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcrypt"));
const uzum_auth_service_1 = require("../uzum-integration/uzum-auth/uzum-auth.service");
let AuthService = class AuthService {
    prisma;
    jwtService;
    uzumAuthService;
    constructor(prisma, jwtService, uzumAuthService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.uzumAuthService = uzumAuthService;
    }
    async login(loginDto) {
        const { identifier, password } = loginDto;
        let user = await this.prisma.user.findFirst({
            where: {
                OR: [
                    { phone: identifier },
                    { email: identifier },
                ]
            }
        });
        if (user) {
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                throw new common_1.UnauthorizedException('Invalid credentials');
            }
        }
        else {
            let uzumSession = await this.uzumAuthService.loginToUzum(identifier, password);
            if ((!uzumSession || !uzumSession.token) && process.env.AUTO_LOGIN === 'true') {
                const autoUser = process.env.UZUM_USERNAME;
                const autoPass = process.env.UZUM_PASSWORD;
                if (autoUser && autoPass) {
                    uzumSession = await this.uzumAuthService.loginToUzum(autoUser, autoPass);
                }
            }
            if (!uzumSession || !uzumSession.token) {
                throw new common_1.UnauthorizedException('Invalid credentials for Uzum API');
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            const isEmail = identifier.includes('@');
            user = await this.prisma.user.create({
                data: {
                    phone: isEmail ? 'UNKNOWN_' + Date.now() : identifier,
                    email: isEmail ? identifier : null,
                    password: hashedPassword,
                    name: uzumSession.name || 'Uzum Seller',
                    role: 'ADMIN',
                    uzumToken: uzumSession.token,
                },
            });
            await this.uzumAuthService.syncShopsForUser(user.id, uzumSession.token);
        }
        const payload = { sub: user.id, phone: user.phone, role: user.role };
        return {
            accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }),
            refreshToken: this.jwtService.sign(payload, { expiresIn: '30d' }),
            user: {
                id: user.id,
                phone: user.phone,
                email: user.email,
                name: user.name,
                role: user.role,
            }
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        uzum_auth_service_1.UzumAuthService])
], AuthService);
//# sourceMappingURL=auth.service.js.map