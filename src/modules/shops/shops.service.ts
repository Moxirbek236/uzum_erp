import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { UzumAuthService } from '../uzum-integration/uzum-auth/uzum-auth.service';

@Injectable()
export class ShopsService {
  private readonly logger = new Logger(ShopsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uzumAuthService: UzumAuthService,
  ) {}

  async getUserShops(userId: string) {
    let permissions = await this.prisma.shopPermission.findMany({
      where: { userId },
    });

    // Auto-sync shops from Uzum API if not found in DB
    if (permissions.length === 0) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user && user.uzumToken) {
        this.logger.log(`No local shops for user ${userId}, triggering Uzum API shop sync...`);
        await this.uzumAuthService.syncShopsForUser(user.id, user.uzumToken);
        permissions = await this.prisma.shopPermission.findMany({ where: { userId } });
      }
    }

    if (permissions.length > 0) {
      const uzumShopIds = permissions.map((p) => p.shopId);
      return this.prisma.shop.findMany({
        where: { uzumShopId: { in: uzumShopIds } },
      });
    }

    return this.prisma.shop.findMany();
  }
}
