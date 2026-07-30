import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ReviewsModule } from '../reviews/reviews.module';
import { ProductsModule } from '../products/products.module';
import { UzumIntegrationModule } from '../uzum-integration/uzum-integration.module';

@Module({
  imports: [ReviewsModule, ProductsModule, UzumIntegrationModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
