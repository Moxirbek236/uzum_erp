import { PrismaService } from '../../core/prisma/prisma.service';
export declare class NotificationsService {
    private readonly prisma;
    private readonly logger;
    private readonly baseUrl;
    constructor(prisma: PrismaService);
    getUnreadCount(userId: string): Promise<{
        unreadCount: number;
    }>;
}
