import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('summary')
  async getSummary(
    @Query('shopId') shopId?: string,
    @Query('page') page = '0',
    @Query('size') size = '20',
  ) {
    const parsedShopId = shopId ? parseInt(shopId, 10) : undefined;
    return this.financeService.getFinanceSummary(
      parsedShopId,
      parseInt(page, 10),
      parseInt(size, 10),
    );
  }
}
