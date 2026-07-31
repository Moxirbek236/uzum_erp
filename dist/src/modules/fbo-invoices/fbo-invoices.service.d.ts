import { PrismaService } from '../../core/prisma/prisma.service';
export declare class FboInvoicesService {
    private readonly prisma;
    private readonly logger;
    private readonly baseUrl;
    constructor(prisma: PrismaService);
    private getUzumToken;
    private getAuthHeaders;
    syncFboInvoices(): Promise<{
        success: boolean;
        message: string;
        count?: undefined;
    } | {
        success: boolean;
        count: number;
        message?: undefined;
    }>;
    getInvoices(shopId?: number, page?: number, size?: number): Promise<{
        data: {
            id: number;
            createdAt: Date;
            updatedAt: Date;
            shopId: number;
            status: string | null;
            stockTitle: string | null;
            poolSource: string | null;
            timeSlotFrom: Date | null;
            timeSlotTo: Date | null;
            boxCount: number;
            itemsCount: number;
            rawData: import("@prisma/client/runtime/client").JsonValue | null;
        }[];
        total: number;
        page: number;
        size: number;
    }>;
}
