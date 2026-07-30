import { Module } from '@nestjs/common';
import { UzumAuthService } from './uzum-auth/uzum-auth.service';
import { UzumShopService } from './uzum-shop/uzum-shop.service';
import { UzumReviewService } from './uzum-review/uzum-review.service';

@Module({
  providers: [UzumAuthService, UzumShopService, UzumReviewService],
  exports: [UzumAuthService, UzumShopService, UzumReviewService],
})
export class UzumIntegrationModule {}
