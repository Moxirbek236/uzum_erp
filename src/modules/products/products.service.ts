import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getProducts(
    shopId?: number,
    page = 0,
    size = 10,
    search?: string,
  ) {
    const where: any = {};

    if (shopId) {
      where.shopId = shopId;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: page * size,
        take: size,
      }),
    ]);

    return {
      total,
      page,
      size,
      items,
    };
  }

  async syncProductsFromUzum(token: string) {
    try {
      this.logger.log('Starting sync of Uzum products...');
      const shops = await this.prisma.shop.findMany();
      if (shops.length === 0) {
        this.logger.warn('No shops found in DB to sync products for.');
        return;
      }

      const baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      if (token.includes('=')) {
        headers['Cookie'] = token;
      } else {
        headers['Authorization'] = `Bearer ${token}`;
      }

      let totalSynced = 0;

      for (const shop of shops) {
        try {
          const shopId = shop.uzumShopId;
          this.logger.log(`Fetching products for shop ${shop.name} (${shopId})...`);
          
          const url = `${baseUrl}/api/seller/shop/${shopId}/product/getProducts?page=0&size=1000&filter=ALL&sortBy=id&searchQuery=&order=descending`;
          const res = await fetch(url, { headers });
          
          if (!res.ok) {
            const errBody = await res.text();
            this.logger.error(`Failed to fetch products for shop ${shopId}. Status: ${res.status}. Body: ${errBody}`);
            continue;
          }

          const data = await res.json();
          const productList = data.productList || [];
          this.logger.log(`Found ${productList.length} products to sync for shop ${shopId}`);

          for (const item of productList) {
            const uzumProductId = item.productId;
            const title = item.title || 'No Title';
            const sku = item.skuTitle || null;
            const price = item.price || 0;
            const stock = item.quantityAvailable || 0;
            const imageUrl = item.image || null;
            const previewImageUrl = item.previewImg || null;
            const category = item.category || null;
            
            const statusValue = item.status?.value || null;
            const statusTitle = item.status?.title || null;
            const statusColor = item.status?.color || null;
            
            const skuList = item.skuList || [];
            const hasMoreOneSku = skuList.length > 1;

            await this.prisma.product.upsert({
              where: { uzumProductId },
              update: {
                title,
                sku,
                price,
                stock,
                imageUrl,
                previewImageUrl,
                statusValue,
                statusTitle,
                statusColor,
                category,
                hasMoreOneSku,
                skuList,
              },
              create: {
                uzumProductId,
                shopId,
                title,
                sku,
                price,
                stock,
                imageUrl,
                previewImageUrl,
                statusValue,
                statusTitle,
                statusColor,
                category,
                hasMoreOneSku,
                skuList,
              },
            });
            totalSynced++;
          }
        } catch (shopErr) {
          this.logger.error(`Error syncing products for shop ${shop.name}:`, shopErr);
        }
      }

      this.logger.log(`Successfully synced ${totalSynced} products from Uzum API`);
    } catch (err) {
      this.logger.error('Error in syncProductsFromUzum:', err);
    }
  }
}
