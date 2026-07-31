import { PrismaService } from '../../core/prisma/prisma.service';
import { SocketGatewayGateway } from '../socket-gateway/socket-gateway.gateway';
export declare class NotificationsService {
    private readonly prisma;
    private readonly socketGateway;
    private readonly logger;
    private readonly baseUrl;
    constructor(prisma: PrismaService, socketGateway: SocketGatewayGateway);
    getUnreadCount(userId: string): Promise<{
        unreadCount: number;
    }>;
    checkNotificationsCron(): Promise<void>;
}
