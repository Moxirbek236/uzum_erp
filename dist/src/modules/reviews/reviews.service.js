"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ReviewsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewsService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../core/prisma/prisma.service");
let ReviewsService = ReviewsService_1 = class ReviewsService {
    prisma;
    logger = new common_1.Logger(ReviewsService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getUnreadReviewCount(shopId) {
        const whereShop = shopId ? { shopId } : {};
        const count = await this.prisma.review.count({
            where: {
                ...whereShop,
                isRead: false,
            },
        });
        return { unreadCount: count };
    }
    async getReviews(shopId, page = 0, size = 10, filter, search) {
        const where = {};
        if (shopId) {
            where.shopId = shopId;
        }
        if (filter === 'UNANSWERED') {
            where.OR = [{ replyStatus: null }, { replyStatus: { not: 'REPLIED' } }];
        }
        else if (filter === 'LOW_RATING') {
            where.rating = { lte: 3 };
        }
        else if (filter === 'PINNED') {
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
    async generateAiReply(reviewId) {
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
        }
        catch (err) {
            this.logger.error('Gemini API xatoligi', err);
        }
        if (!responseText) {
            if (rating === 5) {
                responseText = `Assalomu alaykum ${review.customerName || 'mijoz'}! Xaridingiz va 5 yulduzli a'lo bahoyingiz uchun samimiy minnatdorchilik bildiramiz! Mahsulotimiz sizga ma'qul kelganidan juda mamnunmiz. Do'konimizda sizni yana kutib qolamiz!`;
            }
            else if (rating === 4) {
                responseText = `Assalomu alaykum! Xaridingiz va ijobiy fikringiz uchun rahmat! Mahsulotimiz haqidagi mulohazangizni e'tiborga olamiz va xizmat ko'rsatish sifatini yanada yaxshilashga harakat qilamiz.`;
            }
            else {
                responseText = `Assalomu alaykum ${review.customerName || 'mijoz'}! Yuzaga kelgan noqulaylik uchun chin dildan uzr so'raymiz. Sifat biz uchun eng muhim mezon. Iltimos, muammoni zudlik bilan hal qilishimiz uchun qo'llab-quvvatlash xizmatimizga bog'laning.`;
            }
        }
        return { aiReply: responseText };
    }
    async replyToReview(reviewId, replyText) {
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
    async markAsRead(reviewId) {
        return this.prisma.review.update({
            where: { id: reviewId },
            data: { isRead: true },
        });
    }
    async togglePin(reviewId) {
        const review = await this.prisma.review.findUnique({
            where: { id: reviewId },
        });
        if (!review)
            return null;
        return this.prisma.review.update({
            where: { id: reviewId },
            data: { isPinned: !review.isPinned },
        });
    }
    async sendReplyToUzum(token, reviewIdStr, content) {
        try {
            this.logger.log(`Sending real Uzum API reply for review #${reviewIdStr}`);
            const baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            };
            if (token.includes('=')) {
                headers['Cookie'] = token;
            }
            else {
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
                this.logger.warn(`Uzum review reply create returned status ${res.status}`);
                return false;
            }
            this.logger.log(`Uzum review reply create successful for #${reviewIdStr}`);
            return true;
        }
        catch (err) {
            this.logger.error(`Failed to send reply to Uzum for review #${reviewIdStr}`, err);
            return false;
        }
    }
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
        const firstUser = await this.prisma.user.findFirst({
            where: { uzumToken: { not: null } },
        });
        if (!firstUser || !firstUser.uzumToken) {
            this.logger.warn('AUTO_REPLY skipped: No active Uzum token found.');
            return;
        }
        const { aiReply } = await this.generateAiReply(unrepliedReview.id);
        await this.sendReplyToUzum(firstUser.uzumToken, unrepliedReview.id, aiReply);
        await this.prisma.review.update({
            where: { id: unrepliedReview.id },
            data: {
                replyStatus: 'REPLIED',
                aiReply: aiReply,
                isRead: true,
            },
        });
        this.logger.log(`AUTO_REPLY successfully sent AI reply for review #${unrepliedReview.id}`);
    }
    async syncReviewsFromUzum(token) {
        try {
            this.logger.log('Fetching real product reviews from Uzum API...');
            const baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            };
            if (token.includes('=')) {
                headers['Cookie'] = token;
            }
            else {
                headers['Authorization'] = `Bearer ${token}`;
            }
            const res = await fetch(`${baseUrl}/api/seller/product-reviews?page=0&size=50`, {
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
                    await this.prisma.review.upsert({
                        where: { id: reviewId },
                        update: {
                            rating,
                            content: item.content || null,
                            isRead: item.read || false,
                            replyStatus: item.replyStatus || null,
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
                            replyStatus: item.replyStatus || null,
                        },
                    });
                }
                this.logger.log(`Synced ${reviews.length} reviews from Uzum API into local DB`);
            }
            else {
                this.logger.log('No reviews returned from Uzum API');
            }
        }
        catch (err) {
            this.logger.error('Failed to sync reviews from Uzum API', err);
        }
    }
};
exports.ReviewsService = ReviewsService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ReviewsService.prototype, "handleAutoReply", null);
exports.ReviewsService = ReviewsService = ReviewsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ReviewsService);
//# sourceMappingURL=reviews.service.js.map