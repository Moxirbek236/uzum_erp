import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(private readonly prisma: PrismaService) { }

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
    } else if (filter === 'AI_REPLIED') {
      where.aiReply = { not: null };
    } else if (filter === 'REPLIED') {
      where.replyStatus = 'REPLIED';
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

    const envKeys = process.env.GEMINI_API_KEYS || "";
    const keys = envKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
    if (keys.length === 0) {
      // Fallback keys or handle error
      keys.push(process.env.GEMINI_API_KEY || "");
    }
    // Kalitlarni tasodifiy tartibda aralashtiramiz
    const shuffledKeys = keys.sort(() => 0.5 - Math.random());

    let lastError = null;

    for (const apiKey of shuffledKeys) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

        const prompt = `Siz Uzum Marketdagi onlayn do'kon menejerisiz. Mijoz do'konimizdan mahsulot xarid qilib quyidagi sharhni qoldirdi:
Mijoz ismi: ${review.customerName || 'Anonim'}
Baho (5 yulduzdan): ${rating}
Afzalliklari: ${review.pros || 'Kiritilmagan'}
Kamchiliklari: ${review.cons || 'Kiritilmagan'}
Sharh matni: ${review.content || 'Kiritilmagan'}

Vazifangiz: Mijozga mijoz yozgan tilida (lotin yoki kirill yozuvida) juda samimiy, professional va qisqa javob yozing.
Agar baho past bo'lsa (1-3 yulduz), FAQAT noqulaylik uchun uzr so'rang. QAT'IYAN TAQIQLANADI: mijozga biz bilan bog'lanishni so'rash, pulni qaytarish (vozvrat) yoki tovarni almashtirib berishni va'da qilish. Bular haqida umuman yozmang! Faqatgina noqulaylik uchun uzr so'rang va e'tibori uchun rahmat ayting.
Agar baho yuqori bo'lsa (4-5 yulduz), minnatdorchilik bildiring.
Javobingiz tabiiy inson yozganidek eshitilsin, robotik so'zlardan qoching. Faqat javob matnini o'zini qaytaring.`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        });

        const rawBody = await response.text();

        if (response.ok) {
          const data = JSON.parse(rawBody);
          if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            responseText = data.candidates[0].content.parts[0].text.trim();
            this.logger.log(`[Gemini] Reply generated successfully with key ...${apiKey.slice(-4)}`);
            break; // Muvaffaqiyatli bo'lsa, qolgan kalitlarni tekshirishni to'xtatamiz
          }
        } else {
          this.logger.warn(`[Gemini] Key ...${apiKey.slice(-4)} failed: ${response.status}`);
          lastError = new Error(`API Error ${response.status}: ${rawBody.slice(0, 300)}`);
          // Agar xato bo'lsa (masalan 429), loop davom etadi va keyingi kalitni sinab ko'radi
        }
      } catch (err) {
        this.logger.warn(`[Gemini] Request failed with key ...${apiKey.slice(-4)}: ${err instanceof Error ? err.message : String(err)}`);
        lastError = err;
      }
    }

    if (!responseText) {
      this.logger.warn(`[Gemini] All keys failed. Using static fallback reply based on rating ${rating}.`);
    }

    // Agar Gemini javob bermasa yoki hamma kalitlar limitga tushgan bo'lsa, bahoga qarab tayyor javob ishlatamiz
    if (!responseText) {
      const name = review.customerName || 'mijoz';
      if (rating === 5) {
        responseText = `Assalomu alaykum ${name}! Xaridingiz va 5 yulduzli a'lo bahoyingiz uchun samimiy minnatdorchilik bildiramiz! Mahsulotimiz sizga ma'qul kelganidan juda mamnunmiz. Do'konimizda sizni yana kutib qolamiz!`;
      } else if (rating === 4) {
        responseText = `Assalomu alaykum ${name}! Xaridingiz va ijobiy fikringiz uchun katta rahmat! Mahsulotimiz haqidagi mulohazangizni e'tiborga olamiz va xizmatimizni yanada yaxshilashga harakat qilamiz.`;
      } else if (rating === 3) {
        responseText = `Assalomu alaykum ${name}! Fikr-mulohazangiz uchun rahmat! Xaridingizdan to'liq mamnun bo'lmaganingiz uchun uzr so'raymiz. Xizmat sifatimizni oshirish uchun doimo harakat qilamiz.`;
      } else {
        responseText = `Assalomu alaykum ${name}! Yuzaga kelgan noqulaylik uchun chin dildan uzr so'raymiz. Fikringizni bildirganingiz uchun rahmat — bu biz uchun juda muhim va sifatimizni yaxshilashga undaydi.`;
      }
    }

    return { aiReply: responseText };
  }

  async replyToReview(reviewId: string, replyText: string) {
    const firstUser = await this.prisma.user.findFirst({
      where: { uzumToken: { not: null } },
    });

    if (firstUser && firstUser.uzumToken) {
      await this.sendReplyToUzum(firstUser.uzumToken, reviewId, replyText);
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
        const errBody = await res.text();
        this.logger.warn(`Uzum review reply create returned status ${res.status}. Body: ${errBody}`);

        // Agar "feedback-001" (javob allaqachon bor) xatosi kelsa, DBni REPLIED qilib yangilaymiz
        if (errBody.includes('feedback-001') || errBody.includes('has reply')) {
          this.logger.log(`Review #${reviewIdStr} already has a reply on Uzum. Marking as REPLIED in DB.`);
          await this.prisma.review.update({
            where: { id: reviewIdStr },
            data: { replyStatus: 'REPLIED', repliedAt: new Date() },
          });
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
  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleAutoReply() {
    if (process.env.AUTO_REPLY !== 'true') {
      return;
    }

    this.logger.log('Running AUTO_REPLY background job...');

    const unrepliedReviews = await this.prisma.review.findMany({
      where: {
        OR: [{ replyStatus: null }, { replyStatus: { not: 'REPLIED' } }],
      },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });

    if (!unrepliedReviews || unrepliedReviews.length === 0) {
      return;
    }

    const firstUser = await this.prisma.user.findFirst({
      where: { uzumToken: { not: null } },
    });

    if (!firstUser || !firstUser.uzumToken) {
      this.logger.warn('AUTO_REPLY skipped: No active Uzum token found.');
      return;
    }

    this.logger.log(`AUTO_REPLY found ${unrepliedReviews.length} reviews to process...`);

    for (const review of unrepliedReviews) {
      try {
        // Generate AI reply
        const { aiReply } = await this.generateAiReply(review.id);

        // Send real reply to Uzum API
        await this.sendReplyToUzum(firstUser.uzumToken, review.id, aiReply);

        // Update local DB status
        await this.prisma.review.update({
          where: { id: review.id },
          data: {
            replyStatus: 'REPLIED',
            aiReply: aiReply,
            repliedAt: new Date(),
            isRead: true,
          },
        });

        this.logger.log(`AUTO_REPLY successfully sent AI reply for review #${review.id}`);
      } catch (err) {
        this.logger.error(`AUTO_REPLY error for review #${review.id}:`, err);

        // Agar limitga tushib qolsak, bu minut uchun loopni to'xtatamiz
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (errorMsg.includes('429') || errorMsg.includes('Quota') || errorMsg.includes('exceeded')) {
          this.logger.warn('Gemini 429 limitiga tushildi. Loop to\'xtatildi, qolganiga keyingi daqiqada davom etadi.');
          break;
        }
      }

      // Har bir so'rovdan keyin qat'iy 8 soniya kutish
      await new Promise(resolve => setTimeout(resolve, 8000));
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

      const res = await fetch(`${baseUrl}/api/seller/product-reviews?page=0&size=2000`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ filter: 'ALL' }),
      });

      if (!res.ok) {
        this.logger.warn(`Uzum reviews API returned status ${res.status}`);
        return;
      }

      const data = await res.json();
      const reviews = data?.payload || [];

      if (Array.isArray(reviews) && reviews.length > 0) {
        for (const item of reviews) {
          const reviewId = String(item.reviewId || item.id);
          const shopId = item.shop?.id || 0;
          const productId = item.product?.productId || 0;
          const rating = item.rating || 5;

          // Agar Uzumdan kelgan ma'lumotda 'reply' obyekti bo'lsa, demak unga allaqachon javob berilgan!
          const actualReplyStatus = item.reply ? 'REPLIED' : (item.replyStatus || null);
          const actualAiReply = item.reply ? item.reply.content : null;

          await this.prisma.review.upsert({
            where: { id: reviewId },
            update: {
              rating,
              content: item.content || null,
              isRead: item.read || false,
              replyStatus: actualReplyStatus,
              // Agar avvalroq AI emas, balki odam (Uzum orqali) javob yozgan bo'lsa ham DBga tushib turadi.
              aiReply: actualAiReply,
              repliedAt: item.reply?.dateCreated ? new Date(item.reply.dateCreated) : (actualReplyStatus ? new Date() : null),
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
              replyStatus: actualReplyStatus,
              aiReply: actualAiReply,
              repliedAt: item.reply?.dateCreated ? new Date(item.reply.dateCreated) : (actualReplyStatus ? new Date() : null),
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
