import { PrismaService } from '../../core/prisma/prisma.service';
import { ReviewsService } from '../reviews/reviews.service';
import { ProductsService } from '../products/products.service';
import { FinanceService } from '../finance/finance.service';
import { UzumAuthService } from '../uzum-integration/uzum-auth/uzum-auth.service';
export declare class AnalyticsService {
    private readonly prisma;
    private readonly reviewsService;
    private readonly productsService;
    private readonly financeService;
    private readonly uzumAuthService;
    constructor(prisma: PrismaService, reviewsService: ReviewsService, productsService: ProductsService, financeService: FinanceService, uzumAuthService: UzumAuthService);
    triggerUzumSync(userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    getDashboardSummary(shopId?: number): Promise<{
        summary: {
            totalRevenue: number;
            revenueGrowth: number;
            totalOrders: number;
            ordersGrowth: number;
            totalProducts: number;
            lowStockProducts: number;
            unreadReviews: number;
            totalShops: number;
        };
        salesChart: {
            date: string;
            sales: number;
            orders: number;
        }[];
        recentAlerts: {
            id: string;
            type: string;
            title: string;
            message: string;
            time: string;
        }[];
    }>;
}
