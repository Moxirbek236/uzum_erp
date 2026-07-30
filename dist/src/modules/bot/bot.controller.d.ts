import { BotService } from './bot.service';
export declare class BotController {
    private readonly botService;
    constructor(botService: BotService);
    getStatus(): Promise<{
        connected: boolean;
        botTokenConfigured: boolean;
        groupChatId: string;
        activeMonitors: string[];
    }>;
    sendTestMessage(text?: string): Promise<{
        success: boolean;
        message: string;
    }>;
    triggerDailyReport(): Promise<{
        success: boolean;
        message: string;
    }>;
}
