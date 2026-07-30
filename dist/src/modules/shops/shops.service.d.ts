import { PrismaService } from '../../core/prisma/prisma.service';
import { UzumAuthService } from '../uzum-integration/uzum-auth/uzum-auth.service';
export declare class ShopsService {
    private readonly prisma;
    private readonly uzumAuthService;
    private readonly logger;
    constructor(prisma: PrismaService, uzumAuthService: UzumAuthService);
    getUserShops(userId: string): Promise<{
        name: string;
        id: string;
        uzumShopId: number;
        skuPrefix: string | null;
        description: string | null;
        avatarUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
}
