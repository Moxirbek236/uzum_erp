import { FboInvoicesService } from './fbo-invoices.service';
export declare class FboInvoicesController {
    private readonly invoicesService;
    constructor(invoicesService: FboInvoicesService);
    getInvoices(shopId?: string, page?: string, size?: string): Promise<{
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
    syncInvoices(): Promise<{
        success: boolean;
        message: string;
        count?: undefined;
    } | {
        success: boolean;
        count: number;
        message?: undefined;
    }>;
}
