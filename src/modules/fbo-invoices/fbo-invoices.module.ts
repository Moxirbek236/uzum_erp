import { Module } from '@nestjs/common';
import { FboInvoicesService } from './fbo-invoices.service';
import { FboInvoicesController } from './fbo-invoices.controller';

@Module({
  controllers: [FboInvoicesController],
  providers: [FboInvoicesService],
  exports: [FboInvoicesService],
})
export class FboInvoicesModule {}
