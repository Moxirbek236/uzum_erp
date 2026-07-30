import { PrismaService } from '../../core/prisma/prisma.service';
export declare class ProductsService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getProducts(shopId?: number, page?: number, size?: number, search?: string): Promise<{
        total: number;
        page: number;
        size: number;
        items: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            shopId: number;
            category: string | null;
            sku: string | null;
            title: string;
            uzumProductId: number | null;
            price: number;
            stock: number;
            imageUrl: string | null;
            previewImageUrl: string | null;
            statusValue: string | null;
            statusTitle: string | null;
            statusColor: string | null;
            categoryId: number | null;
            hasMoreOneSku: boolean;
            skuList: import("@prisma/client/runtime/client").JsonValue | null;
        }[];
    }>;
    syncProductsFromUzum(token: string): Promise<void>;
}
