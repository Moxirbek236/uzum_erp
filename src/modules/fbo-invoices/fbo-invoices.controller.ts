import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { FboInvoicesService } from './fbo-invoices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('fbo-invoices')
export class FboInvoicesController {
  constructor(private readonly invoicesService: FboInvoicesService) {}

  @Get()
  async getInvoices(
    @Query('shopId') shopId?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const sId = shopId ? parseInt(shopId, 10) : undefined;
    const p = page ? parseInt(page, 10) : 1;
    const s = size ? parseInt(size, 10) : 20;
    
    return this.invoicesService.getInvoices(sId, p, s);
  }

  @Post('sync')
  async syncInvoices() {
    return this.invoicesService.syncFboInvoices();
  }
}
