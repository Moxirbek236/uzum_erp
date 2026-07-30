import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';

  constructor(private readonly prisma: PrismaService) {}

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
}
