import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

import { ReviewsService } from '../reviews/reviews.service';
import { ProductsService } from '../products/products.service';
import { FinanceService } from '../finance/finance.service';
import { UzumAuthService } from '../uzum-integration/uzum-auth/uzum-auth.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewsService: ReviewsService,
    private readonly productsService: ProductsService,
    private readonly financeService: FinanceService,
    private readonly uzumAuthService: UzumAuthService,
  ) {}

  async triggerUzumSync(userId: string) {
    let user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    let token = user?.uzumToken;

    // Fallback: If user has no uzumToken in DB, perform auto-login with ENV credentials or login to obtain a fresh token
    if (!token) {
      const username = process.env.UZUM_USERNAME || user?.email || user?.phone;
      const password = process.env.UZUM_PASSWORD;
      
      if (username && password) {
        const uzumSession = await this.uzumAuthService.loginToUzum(username, password);
        if (uzumSession && uzumSession.token) {
          token = uzumSession.token;
          if (user) {
            await this.prisma.user.update({
              where: { id: user.id },
              data: { uzumToken: token },
            });
          }
        }
      }
    }

    if (!token || !user) {
      return { success: false, message: 'Uzum session token not found. Please log in again.' };
    }

    // Sync shops
    await this.uzumAuthService.syncShopsForUser(user.id, token);

    // Sync products
    await this.productsService.syncProductsFromUzum(token);

    // Sync finance
    await this.financeService.syncFinanceDataFromUzum(token);

    // Sync reviews
    await this.reviewsService.syncReviewsFromUzum(token);

    return { success: true, message: 'Uzum API sync completed successfully' };
  }

  async getDashboardSummary(shopId?: number) {
    const whereShop = shopId ? { shopId } : {};

    // 1. Dynamic review counts from DB
    const unreadReviews = await this.prisma.review.count({
      where: {
        ...whereShop,
        isRead: false,
      },
    });

    // 2. Dynamic shop count from DB
    const totalShops = shopId 
      ? 1 
      : await this.prisma.shop.count();

    // 3. Dynamic product counts from DB
    const totalProducts = await this.prisma.product.count({
      where: whereShop,
    });

    const lowStockProducts = await this.prisma.product.count({
      where: {
        ...whereShop,
        stock: { lte: 5 },
      },
    });

    // 4. Dynamic order counts and revenue aggregation from DB
    const totalOrders = await this.prisma.order.count({
      where: whereShop,
    });

    const revenueAggregate = await this.prisma.order.aggregate({
      where: whereShop,
      _sum: {
        sellPrice: true,
      },
    });

    const totalRevenue = revenueAggregate._sum.sellPrice || 0;

    // 5. Generate Sales Chart (Last 7 days)
    const salesChart = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const startOfDay = new Date(d.setHours(0, 0, 0, 0));
      const endOfDay = new Date(d.setHours(23, 59, 59, 999));
      
      const dayOrders = await this.prisma.order.aggregate({
        where: {
          ...whereShop,
          updatedAt: { gte: startOfDay, lte: endOfDay }
        },
        _sum: { sellPrice: true },
        _count: { id: true }
      });
      
      salesChart.push({
        date: startOfDay.toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' }),
        sales: dayOrders._sum.sellPrice || 0,
        orders: dayOrders._count.id || 0,
      });
    }

    // 6. Generate Recent Alerts
    const recentAlerts = [];
    const latestReviews = await this.prisma.review.findMany({
      where: { ...whereShop, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    
    latestReviews.forEach((r, idx) => {
      recentAlerts.push({
        id: `rev-${r.id}`,
        type: 'review',
        title: 'Yangi sharh',
        message: `Mijoz mahsulotingizga baho berdi: ${r.rating} yulduz.`,
        time: r.createdAt.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
      });
    });
    
    if (lowStockProducts > 0) {
      recentAlerts.push({
        id: 'low-stock',
        type: 'inventory',
        title: 'Zaxira tugamoqda',
        message: `${lowStockProducts} ta mahsulot zaxirasi minimal darajaga yetdi.`,
        time: new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
      });
    }

    return {
      summary: {
        totalRevenue,
        revenueGrowth: 0,
        totalOrders,
        ordersGrowth: 0,
        totalProducts,
        lowStockProducts,
        unreadReviews,
        totalShops,
      },
      salesChart,
      recentAlerts,
    };
  }
}
