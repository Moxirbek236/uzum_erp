import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getUnreadReviewCount(shopId?: number) {
    const whereShop = shopId ? { shopId } : {};
    const count = await this.prisma.review.count({
      where: {
        ...whereShop,
        isRead: false,
      },
    });
    return { unreadCount: count };
  }

  async getReviews(
    shopId?: number,
    page = 0,
    size = 10,
    filter?: string,
    search?: string,
  ) {
    const where: any = {};

    if (shopId) {
      where.shopId = shopId;
    }

    if (filter === 'UNANSWERED') {
      where.OR = [{ replyStatus: null }, { replyStatus: { not: 'REPLIED' } }];
    } else if (filter === 'LOW_RATING') {
      where.rating = { lte: 3 };
    } else if (filter === 'PINNED') {
      where.isPinned = true;
    }

    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
        { pros: { contains: search, mode: 'insensitive' } },
        { cons: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        skip: page * size,
        take: size,
      }),
    ]);

    return {
      total,
      page,
      size,
      items,
    };
  }

  async generateAiReply(reviewId: string): Promise<{ aiReply: string }> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new Error('Sharh topilmadi');
    }

    const rating = review.rating || 5;
    let responseText = '';

    try {
      if (process.env.GEMINI_API_KEY) {
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        const prompt = `Siz Uzum Marketdagi onlayn do'kon menejerisiz. Mijoz do'konimizdan mahsulot xarid qilib quyidagi sharhni qoldirdi:
Mijoz ismi: ${review.customerName || 'Anonim'}
Baho (5 yulduzdan): ${rating}
Afzalliklari: ${review.pros || 'Kiritilmagan'}
Kamchiliklari: ${review.cons || 'Kiritilmagan'}
Sharh matni: ${review.content || 'Kiritilmagan'}

Vazifangiz: Mijozga mijoy yozgan tilida (lotin yoki kirill yozuvida) juda samimiy, professional va qisqa javob yozing.
Agar baho past bo'lsa (1-3 yulduz), uzr so'rang va muammoni hal qilishga tayyor ekanligingizni bildiring.
Agar baho yuqori bo'lsa (4-5 yulduz), minnatdorchilik bildiring.
Javobingiz tabiiy inson yozganidek eshitilsin, robotik so'zlardan qoching. Faqat javob matnini o'zini qaytaring.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        
        if (response.text) {
          responseText = response.text.trim();
        }
      }
    } catch (err) {
      this.logger.error('Gemini API xatoligi', err);
    }

    if (!responseText) {
      if (rating === 5) {
        responseText = `Assalomu alaykum ${review.customerName || 'mijoz'}! Xaridingiz va 5 yulduzli a'lo bahoyingiz uchun samimiy minnatdorchilik bildiramiz! Mahsulotimiz sizga ma'qul kelganidan juda mamnunmiz. Do'konimizda sizni yana kutib qolamiz!`;
      } else if (rating === 4) {
        responseText = `Assalomu alaykum! Xaridingiz va ijobiy fikringiz uchun rahmat! Mahsulotimiz haqidagi mulohazangizni e'tiborga olamiz va xizmat ko'rsatish sifatini yanada yaxshilashga harakat qilamiz.`;
      } else {
        responseText = `Assalomu alaykum ${review.customerName || 'mijoz'}! Yuzaga kelgan noqulaylik uchun chin dildan uzr so'raymiz. Sifat biz uchun eng muhim mezon. Iltimos, muammoni zudlik bilan hal qilishimiz uchun qo'llab-quvvatlash xizmatimizga bog'laning.`;
      }
    }

    return { aiReply: responseText };
  }

  async replyToReview(reviewId: string, replyText: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });

    let tokenToUse: string | null = null;
    if (review && review.shopId) {
      const shopPermission = await this.prisma.shopPermission.findFirst({
        where: { shopId: review.shopId },
        include: { user: true },
      });
      if (shopPermission?.user?.uzumToken) {
        tokenToUse = shopPermission.user.uzumToken;
      }
    }

    if (!tokenToUse) {
      const firstUser = await this.prisma.user.findFirst({
        where: { uzumToken: { not: null } },
      });
      tokenToUse = firstUser?.uzumToken || null;
    }

    if (tokenToUse) {
      await this.sendReplyToUzum(tokenToUse, reviewId, replyText);
    }

    return this.prisma.review.update({
      where: { id: reviewId },
      data: {
        replyStatus: 'REPLIED',
        aiReply: replyText,
        isRead: true,
      },
    });
  }

  async markAsRead(reviewId: string) {
    return this.prisma.review.update({
      where: { id: reviewId },
      data: { isRead: true },
    });
  }

  async togglePin(reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) return null;

    return this.prisma.review.update({
      where: { id: reviewId },
      data: { isPinned: !review.isPinned },
    });
  }

  /**
   * Sends a real review reply payload to Uzum API
   * Endpoint: POST https://api-seller.uzum.uz/api/seller/product-reviews/reply/create
   * Payload: [{ reviewId, content }]
   */
  async sendReplyToUzum(token: string, reviewIdStr: string, content: string) {
    try {
      this.logger.log(`Sending real Uzum API reply for review #${reviewIdStr}`);
      const baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      if (token.includes('=')) {
        headers['Cookie'] = token;
      } else {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const parsedId = parseInt(reviewIdStr, 10);
      const payload = [
        {
          reviewId: isNaN(parsedId) ? reviewIdStr : parsedId,
          content: content,
        },
      ];

      const res = await fetch(`${baseUrl}/api/seller/product-reviews/reply/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        this.logger.warn(`Uzum review reply create returned status ${res.status}. Body: ${errorText}`);
        
        // Agar allaqachon javob berilgan bo'lsa (Uzum kabinetidan yozilgan bo'lsa), DB da ham REPLIED qilib belgilash uchun true qaytaramiz
        if (errorText.includes('has reply') || errorText.includes('feedback-001')) {
          this.logger.log(`Review #${reviewIdStr} is already replied on Uzum. Treating as success to update local DB.`);
          return true;
        }

        return false;
      }

      this.logger.log(`Uzum review reply create successful for #${reviewIdStr}`);
      return true;
    } catch (err) {
      this.logger.error(`Failed to send reply to Uzum for review #${reviewIdStr}`, err);
      return false;
    }
  }

  /**
   * Rate-limited Auto-Reply Cron job.
   * Runs every 1 minute if AUTO_REPLY=true in .env.
   * Processes 1 un-replied review per minute to prevent Uzum rate-limiting/blocking.
   */
@Cron(CronExpression.EVERY_5_MINUTES)
  async handleAutoReply() {
    if (process.env.AUTO_REPLY !== 'true') {
      return;
    }

    this.logger.log('Running AUTO_REPLY background job...');

    const unrepliedReview = await this.prisma.review.findFirst({
      where: {
        OR: [{ replyStatus: null }, { replyStatus: { not: 'REPLIED' } }],
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!unrepliedReview) {
      return;
    }

    let tokenToUse: string | null = null;
    if (unrepliedReview.shopId) {
      const shopPermission = await this.prisma.shopPermission.findFirst({
        where: { shopId: unrepliedReview.shopId },
        include: { user: true },
      });
      if (shopPermission?.user?.uzumToken) {
        tokenToUse = shopPermission.user.uzumToken;
      }
    }

    if (!tokenToUse) {
      const firstUser = await this.prisma.user.findFirst({
        where: { uzumToken: { not: null } },
      });
      tokenToUse = firstUser?.uzumToken || null;
    }

    if (!tokenToUse) {
      this.logger.warn(`AUTO_REPLY skipped: No active Uzum token found for shop ${unrepliedReview.shopId}.`);
      return;
    }

    // Generate AI reply
    const { aiReply } = await this.generateAiReply(unrepliedReview.id);

    // Send real reply to Uzum API
    const isSuccess = await this.sendReplyToUzum(tokenToUse, unrepliedReview.id, aiReply);

    if (isSuccess) {
      // Update local DB status only if successful
      await this.prisma.review.update({
        where: { id: unrepliedReview.id },
        data: {
          replyStatus: 'REPLIED',
          aiReply: aiReply,
          isRead: true,
        },
      });

      this.logger.log(`AUTO_REPLY successfully sent AI reply for review #${unrepliedReview.id}`);
    } else {
      this.logger.warn(`AUTO_REPLY failed to send AI reply for review #${unrepliedReview.id}`);
    }
  }

  async syncReviewsFromUzum(token: string) {
    try {
      this.logger.log('Fetching real product reviews from Uzum API...');
      const baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      if (token.includes('=')) {
        headers['Cookie'] = token;
      } else {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const resAll = await fetch(`${baseUrl}/api/seller/product-reviews?page=0&size=50`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ filter: 'ALL' }),
      });

      const resNoReply = await fetch(`${baseUrl}/api/seller/product-reviews?page=0&size=50`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ filter: 'NO_REPLY' }),
      });

      let reviews: any[] = [];
      
      if (resAll.ok) {
        const dataAll = await resAll.json();
        if (dataAll?.payload) reviews = [...reviews, ...dataAll.payload];
      } else {
        this.logger.warn(`Uzum reviews ALL API returned status ${resAll.status}`);
      }

      if (resNoReply.ok) {
        const dataNoReply = await resNoReply.json();
        if (dataNoReply?.payload) reviews = [...reviews, ...dataNoReply.payload];
      } else {
        this.logger.warn(`Uzum reviews NO_REPLY API returned status ${resNoReply.status}`);
      }

      // Deduplicate reviews by ID
      const uniqueReviewsMap = new Map();
      reviews.forEach(r => uniqueReviewsMap.set(r.reviewId || r.id, r));
      reviews = Array.from(uniqueReviewsMap.values());

      if (Array.isArray(reviews) && reviews.length > 0) {
        for (const item of reviews) {
          const reviewId = String(item.reviewId || item.id);
          const shopId = item.shop?.id || 0;
          const productId = item.product?.productId || 0;
          const rating = item.rating || 5;

          const isReplied = item.reply !== null && item.reply !== undefined;
          const mappedReplyStatus = isReplied ? 'REPLIED' : 'NO_REPLY';
          const existingReplyContent = isReplied ? item.reply.content : null;

          await this.prisma.review.upsert({
            where: { id: reviewId },
            update: {
              rating,
              content: item.content || null,
              isRead: item.read || false,
              replyStatus: mappedReplyStatus,
              ...(existingReplyContent && { aiReply: existingReplyContent }),
            },
            create: {
              id: reviewId,
              shopId,
              productId,
              rating,
              packagingRating: item.packagingQualityRating || null,
              deliveryRating: item.deliveryRating || null,
              content: item.content || null,
              pros: item.pros || null,
              cons: item.cons || null,
              customerName: item.customerName || null,
              createdAt: item.dateCreated ? new Date(item.dateCreated) : new Date(),
              isRead: item.read || false,
              isPinned: item.pinned || false,
              replyStatus: mappedReplyStatus,
              aiReply: existingReplyContent,
            },
          });
        }
        this.logger.log(`Synced ${reviews.length} reviews from Uzum API into local DB`);
      } else {
        this.logger.log('No reviews returned from Uzum API');
      }
    } catch (err) {
      this.logger.error('Failed to sync reviews from Uzum API', err);
    }
  }
}
