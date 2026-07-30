import { FinanceService } from './finance.service';
export declare class FinanceController {
    private readonly financeService;
    constructor(financeService: FinanceService);
    getSummary(shopId?: string, page?: string, size?: string): Promise<{
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
}
