import { ProductsService } from './products.service';
export declare class ProductsController {
    private readonly productsService;
    constructor(productsService: ProductsService);
    getProducts(shopId?: string, page?: string, size?: string, search?: string): Promise<{
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
}
