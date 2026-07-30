import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async getProducts(
    @Query('shopId') shopId?: string,
    @Query('page') page = '0',
    @Query('size') size = '10',
    @Query('search') search?: string,
  ) {
    const parsedShopId = shopId ? parseInt(shopId, 10) : undefined;
    return this.productsService.getProducts(
      parsedShopId,
      parseInt(page, 10),
      parseInt(size, 10),
      search,
    );
  }
}
