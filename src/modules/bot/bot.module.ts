import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { UzumIntegrationModule } from '../uzum-integration/uzum-integration.module';

@Module({
  imports: [UzumIntegrationModule],
  providers: [BotService],
  controllers: [BotController]
})
export class BotModule {}
