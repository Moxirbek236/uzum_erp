import { PrismaService } from '../../core/prisma/prisma.service';
export declare class FinanceService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getFinanceSummary(shopId?: number, page?: number, size?: number): Promise<{
        summary: {
            commonBalance: number;
            returnsPerMonth: number;
            regularWithdrawSum: number;
            urgentWithdrawSum: number;
            expenses: any[];
        };
        orders: {
            total: number;
            page: number;
            size: number;
            items: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                shopId: number;
                status: string;
                sellPrice: number;
                sellerProfit: number;
                commission: number;
                purchasePrice: number;
                logisticDeliveryFee: number;
                amountReturns: number;
                productTitle: string;
            }[];
        };
    }>;
    syncFinanceDataFromUzum(token: string): Promise<void>;
}
