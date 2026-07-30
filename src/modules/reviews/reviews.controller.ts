import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('unread-count')
  async getUnreadCount(@Query('shopId') shopId?: string) {
    const parsedShopId = shopId ? parseInt(shopId, 10) : undefined;
    return this.reviewsService.getUnreadReviewCount(parsedShopId);
  }

  @Get()
  async getReviews(
    @Query('shopId') shopId?: string,
    @Query('page') page = '0',
    @Query('size') size = '10',
    @Query('filter') filter?: string,
    @Query('search') search?: string,
  ) {
    const parsedShopId = shopId ? parseInt(shopId, 10) : undefined;
    return this.reviewsService.getReviews(
      parsedShopId,
      parseInt(page, 10),
      parseInt(size, 10),
      filter,
      search,
    );
  }

  @Post(':id/generate-ai-reply')
  async generateAiReply(@Param('id') id: string) {
    return this.reviewsService.generateAiReply(id);
  }

  @Post(':id/reply')
  async replyToReview(
    @Param('id') id: string,
    @Body('replyText') replyText: string,
  ) {
    return this.reviewsService.replyToReview(id, replyText);
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string) {
    return this.reviewsService.markAsRead(id);
  }

  @Patch(':id/pin')
  async togglePin(@Param('id') id: string) {
    return this.reviewsService.togglePin(id);
  }
}
