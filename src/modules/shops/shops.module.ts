import { Module } from '@nestjs/common';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';
import { UzumIntegrationModule } from '../uzum-integration/uzum-integration.module';

@Module({
  imports: [UzumIntegrationModule],
  controllers: [ShopsController],
  providers: [ShopsService],
  exports: [ShopsService],
})
export class ShopsModule {}
