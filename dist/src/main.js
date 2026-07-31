"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors({
        origin: [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'https://uzum-erp-frontend.vercel.app',
            process.env.FRONTEND_URL,
        ].filter(Boolean),
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    const host = process.env.HOST || '0.0.0.0';
    const port = Number(process.env.PORT) || 4000;
    await app.listen(port, host);
    console.log(`🚀 Server running at http://${host}:${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map