import { Module } from '@nestjs/common';
import { FboInvoicesController } from './fbo-invoices.controller';
import { FboInvoicesService } from './fbo-invoices.service';

@Module({
  controllers: [FboInvoicesController],
  providers: [FboInvoicesService],
  exports: [FboInvoicesService],
})
export class FboInvoicesModule {}
