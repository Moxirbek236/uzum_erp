import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class UzumAuthService {
  private readonly logger = new Logger(UzumAuthService.name);
  private readonly baseUrl = process.env.UZUM_SELLER_API_BASE || 'https://api-seller.uzum.uz';
  private readonly financeUrl = process.env.UZUM_FINANCE_API_BASE || 'https://api.uzum.uz';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mock implementation for login to Uzum API, since actual Uzum Auth API might
   * require OTP or have specific internal flows. 
   * In a real implementation, you would call Uzum's /auth endpoint.
   */
  async loginToUzum(identifier: string, password: string): Promise<{ token: string; name: string } | null> {
    try {
      this.logger.log(`Attempting real Uzum login for ${identifier}`);
      
      const payload = new URLSearchParams({
        grant_type: 'password',
        username: identifier,
        password: password,
        client_id: 'b2b-front'
      });

      const response = await fetch(`${this.baseUrl}/api/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic YjJiLWZyb250OmNsaWVudFNlY3JldA==', // 'b2b-front:clientSecret'
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Origin': 'https://seller.uzum.uz',
          'Referer': 'https://seller.uzum.uz/',
          'Accept': 'application/json'
        },
        body: payload.toString(),
      });

      if (!response.ok) {
        this.logger.warn(`Uzum API login failed with status: ${response.status}`);
        return null;
      }

      let tokenStr = '';
      let isCookie = false;

      // Prioritize JSON parsing for access_token
      try {
        const data = await response.json();
        if (data && data.access_token) {
          tokenStr = data.access_token;
        }
      } catch (e) {
        // Ignore JSON parse error
      }

      // Fallback to Set-Cookie if no access_token found in body
      if (!tokenStr) {
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) {
          tokenStr = setCookie;
          isCookie = true;
        }
      }

      if (!tokenStr) {
         this.logger.warn('Uzum API login succeeded but no token/cookie found in response');
         return null;
      }

      // Verification check as requested by user
      const headersForVerification: Record<string, string> = {};
      if (isCookie) {
        headersForVerification['Cookie'] = tokenStr; // If it's a cookie string
      } else {
        headersForVerification['Authorization'] = `Bearer ${tokenStr}`;
      }

      const verifyRes = await fetch(`${this.baseUrl}/api/seller/verification`, {
        method: 'GET',
        headers: headersForVerification,
      });

      if (verifyRes.ok) {
        this.logger.log(`Uzum Verification successful (200 OK) with ${isCookie ? 'Cookie' : 'Bearer'}`);
        return {
          token: tokenStr,
          name: identifier, 
        };
      }
      
      const errorText = await verifyRes.text();
      this.logger.warn(`Uzum Verification failed (Not 200). Status: ${verifyRes.status}, Body: ${errorText}`);
      return null;
    } catch (error) {
      this.logger.error('Error logging into Uzum API', error);
      return null;
    }
  }

  /**
   * Syncs the user's shops from Uzum API to our local DB
   * Endpoint: GET https://api.uzum.uz/api/seller/shop/
   */
  async syncShopsForUser(userId: string, token: string) {
    try {
      this.logger.log(`Fetching shops from Uzum API for user ${userId}`);
      
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (token.includes('=')) {
        headers['Cookie'] = token;
      } else {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // 1. Try GET https://api.uzum.uz/api/seller/shop/
      let shopsData: Array<{ id: number; shopTitle?: string; name?: string; title?: string }> = [];

      try {
        const res = await fetch(`${this.financeUrl}/api/seller/shop/`, { headers });
        if (res.ok) {
          const parsed = await res.json();
          if (Array.isArray(parsed)) {
            shopsData = parsed;
          }
        }
      } catch (e) {
        this.logger.warn('Failed fetching /api/seller/shop/', e);
      }

      // 2. Try check_token if no shops found from previous endpoint
      if (shopsData.length === 0) {
        try {
          const checkRes = await fetch(`${this.baseUrl}/api/auth/seller/check_token`, {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `token=${encodeURIComponent(token)}`,
          });

          if (checkRes.ok) {
            const checkData = await checkRes.json();
            const orgs = checkData?.organizations || {};
            const orgIds = Object.keys(orgs);
            
            for (const orgIdStr of orgIds) {
              const shopId = parseInt(orgIdStr, 10);
              if (!isNaN(shopId)) {
                shopsData.push({
                  id: shopId,
                  shopTitle: `Do'kon #${shopId}`,
                });
              }
            }
          }
        } catch (e) {
          this.logger.warn('Failed calling check_token for shops', e);
        }
      }

      if (shopsData.length > 0) {
        for (const shop of shopsData) {
          const shopName = shop.shopTitle || shop.name || shop.title || `Do'kon #${shop.id}`;
          await this.prisma.shop.upsert({
            where: { uzumShopId: shop.id },
            update: { name: shopName },
            create: {
              uzumShopId: shop.id,
              name: shopName,
            },
          });
          
          await this.prisma.shopPermission.upsert({
            where: {
              shopId_userId_permission: {
                shopId: shop.id,
                userId: userId,
                permission: 'OWNER',
              }
            },
            update: {},
            create: {
              shopId: shop.id,
              userId: userId,
              permission: 'OWNER',
            }
          });
        }
        this.logger.log(`Synced ${shopsData.length} shops from Uzum API for user ${userId}`);
      } else {
        this.logger.log(`No shops returned from Uzum API for user ${userId}`);
      }
    } catch (error) {
      this.logger.error('Failed to sync shops', error);
    }
  }
}
