import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class FboInvoicesService {
  private readonly logger = new Logger(FboInvoicesService.name);
  private readonly baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';

  constructor(private readonly prisma: PrismaService) {}

  private async getUzumToken(): Promise<string | null> {
    const firstUser = await this.prisma.user.findFirst({
      where: { uzumToken: { not: null } },
    });
    return firstUser?.uzumToken || null;
  }

  private getAuthHeaders(token: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (token.includes('=')) {
      headers['Cookie'] = token;
    } else {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Sync FBO invoices for all shops from Uzum Seller API
   */
  async syncFboInvoices() {
    this.logger.log('Starting FBO Invoices sync...');
    const token = await this.getUzumToken();
    if (!token) {
      this.logger.warn('No Uzum token found. Cannot sync invoices.');
      return { success: false, message: 'Token topilmadi' };
    }

    const shops = await this.prisma.shop.findMany();
    if (!shops.length) {
      return { success: false, message: 'Do\'konlar topilmadi' };
    }

    const headers = this.getAuthHeaders(token);
    let syncedCount = 0;

    for (const shop of shops) {
      try {
        const response = await fetch(`${this.baseUrl}/api/seller/shop/${shop.uzumShopId}/invoice?page=0&size=50`, {
          headers,
        });

        if (!response.ok) {
          this.logger.error(`Failed to fetch FBO invoices for shop ${shop.uzumShopId}: ${response.statusText}`);
          continue;
        }

        const invoicesData = await response.json();
        
        for (const item of invoicesData) {
          const invoiceId = item.id;
          if (!invoiceId) continue;

          await this.prisma.invoice.upsert({
            where: { id: invoiceId },
            create: {
              id: invoiceId,
              shopId: shop.uzumShopId,
              status: item.status || 'UNKNOWN',
              stockTitle: item.stock?.title || '',
              poolSource: item.stock?.poolSource || '',
              timeSlotFrom: item.timeSlotReservation?.timeFrom ? new Date(item.timeSlotReservation.timeFrom) : null,
              timeSlotTo: item.timeSlotReservation?.timeTo ? new Date(item.timeSlotReservation.timeTo) : null,
              boxCount: item.boxCount || 0,
              itemsCount: item.itemsCount || 0,
              rawData: item,
            },
            update: {
              status: item.status || 'UNKNOWN',
              timeSlotFrom: item.timeSlotReservation?.timeFrom ? new Date(item.timeSlotReservation.timeFrom) : null,
              timeSlotTo: item.timeSlotReservation?.timeTo ? new Date(item.timeSlotReservation.timeTo) : null,
              boxCount: item.boxCount || 0,
              itemsCount: item.itemsCount || 0,
              rawData: item,
            },
          });
          syncedCount++;
        }
      } catch (err) {
        this.logger.error(`Error syncing FBO invoices for shop ${shop.uzumShopId}`, err);
      }
    }

    this.logger.log(`FBO Invoices sync completed. Synced ${syncedCount} invoices.`);
    return { success: true, count: syncedCount };
  }

  /**
   * Get synced invoices for frontend
   */
  async getInvoices(shopId?: number, page: number = 1, size: number = 20) {
    const where = shopId ? { shopId } : {};
    
    const [total, data] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
    ]);

    return {
      data,
      total,
      page,
      size,
    };
  }
}
