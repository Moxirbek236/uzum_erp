import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
export declare class BotService implements OnModuleInit {
    private readonly prisma;
    private readonly logger;
    private bot;
    private readonly botToken;
    private readonly groupChatId;
    constructor(prisma: PrismaService);
    onModuleInit(): void;
    sendGroupNotification(text: string, targetChatId?: string): Promise<boolean>;
    handleDailyReportCron(): Promise<void>;
    handleMonthlyReportCron(): Promise<void>;
    handleSlotMonitoringCron(): Promise<void>;
    private checkSlotsForShop;
    private buildDailyReportMessage;
    private buildMonthlyReportMessage;
    private buildSlotsMessage;
    private buildStatsMessage;
}
