import { PrismaService } from '../../../core/prisma/prisma.service';
export declare class UzumAuthService {
    private readonly prisma;
    private readonly logger;
    private readonly baseUrl;
    private readonly financeUrl;
    constructor(prisma: PrismaService);
    loginToUzum(identifier: string, password: string): Promise<{
        token: string;
        name: string;
    } | null>;
    syncShopsForUser(userId: string, token: string): Promise<void>;
}
