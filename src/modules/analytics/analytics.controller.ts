import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  async getDashboardSummary(@Query('shopId') shopId?: string) {
    const parsedShopId = shopId ? parseInt(shopId, 10) : undefined;
    return this.analyticsService.getDashboardSummary(parsedShopId);
  }

  @Post('sync')
  async triggerSync(@CurrentUser() user: { userId: string }) {
    return this.analyticsService.triggerUzumSync(user.userId);
  }
}
