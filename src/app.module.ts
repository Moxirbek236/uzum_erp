import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UzumIntegrationModule } from './modules/uzum-integration/uzum-integration.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { ShopsModule } from './modules/shops/shops.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { BotModule } from './modules/bot/bot.module';
import { SocketGatewayModule } from './modules/socket-gateway/socket-gateway.module';

import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './core/prisma/prisma.module';

import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProductsModule } from './modules/products/products.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
      },
    }),
    PrismaModule,
    AuthModule, 
    UzumIntegrationModule, 
    ReviewsModule, 
    ShopsModule,
    AnalyticsModule,
    NotificationsModule,
    ProductsModule,
    BotModule, 
    SocketGatewayModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
