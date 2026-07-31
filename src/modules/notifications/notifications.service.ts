import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SocketGatewayGateway } from '../socket-gateway/socket-gateway.gateway';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';

  constructor(
    private readonly prisma: PrismaService,
    private readonly socketGateway: SocketGatewayGateway,
  ) {}

  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.uzumToken) {
      return { unreadCount: 0 };
    }

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (user.uzumToken.includes('=')) {
        headers['Cookie'] = user.uzumToken;
      } else {
        headers['Authorization'] = `Bearer ${user.uzumToken}`;
      }

      const res = await fetch(`${this.baseUrl}/api/v1/seller/notification/unread-count`, {
        method: 'GET',
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        return { unreadCount: data?.unreadCount || 0 };
      }

      this.logger.warn(`Uzum notification API returned status ${res.status}`);
      return { unreadCount: 0 };
    } catch (err) {
      this.logger.error('Failed to fetch unread notifications count from Uzum API', err);
      return { unreadCount: 0 };
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkNotificationsCron() {
    this.logger.log('Running notifications check cron...');
    const users = await this.prisma.user.findMany({
      where: { uzumToken: { not: null } },
    });

    for (const user of users) {
      const result = await this.getUnreadCount(user.id);
      if (result.unreadCount > 0) {
        // Emit to all clients for now, or to a specific user room if we had user rooms
        this.socketGateway.server.emit('notification.count.updated', {
          userId: user.id,
          unreadCount: result.unreadCount,
        });
      }
    }
  }
}
