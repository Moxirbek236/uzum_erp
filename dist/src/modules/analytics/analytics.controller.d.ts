import { AnalyticsService } from './analytics.service';
export declare class AnalyticsController {
    private readonly analyticsService;
    constructor(analyticsService: AnalyticsService);
    getDashboardSummary(shopId?: string): Promise<{
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
    triggerSync(user: {
        userId: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
}
