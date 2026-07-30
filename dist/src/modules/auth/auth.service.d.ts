import { PrismaService } from '../../core/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { UzumAuthService } from '../uzum-integration/uzum-auth/uzum-auth.service';
export declare class AuthService {
    private readonly prisma;
    private readonly jwtService;
    private readonly uzumAuthService;
    constructor(prisma: PrismaService, jwtService: JwtService, uzumAuthService: UzumAuthService);
    login(loginDto: LoginDto): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            phone: string;
            email: string | null;
            name: string | null;
            role: string;
        };
    }>;
}
