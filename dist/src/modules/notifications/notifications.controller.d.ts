import { NotificationsService } from './notifications.service';
export declare class NotificationsController {
    private readonly notificationsService;
    constructor(notificationsService: NotificationsService);
    getUnreadCount(user: {
        userId: string;
    }): Promise<{
        unreadCount: number;
    }>;
}
