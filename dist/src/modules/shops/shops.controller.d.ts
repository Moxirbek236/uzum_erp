import { ShopsService } from './shops.service';
export declare class ShopsController {
    private readonly shopsService;
    constructor(shopsService: ShopsService);
    getShops(user: {
        userId: string;
    }): Promise<{
        name: string;
        id: string;
        uzumShopId: number;
        skuPrefix: string | null;
        description: string | null;
        avatarUrl: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
}
