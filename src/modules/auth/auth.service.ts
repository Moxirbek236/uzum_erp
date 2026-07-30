import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { UzumAuthService } from '../uzum-integration/uzum-auth/uzum-auth.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly uzumAuthService: UzumAuthService,
  ) {}

  async login(loginDto: LoginDto) {
    const { identifier, password } = loginDto;
    
    // 1. Check if user exists in local DB by phone or email
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: identifier },
          { email: identifier },
        ]
      }
    });

    if (user) {
      // 2. Validate password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }
    } else {
      // 3. User not in DB, attempt Uzum API login (Assuming Uzum expects phone as identifier for login)
      let uzumSession = await this.uzumAuthService.loginToUzum(identifier, password);
      
      if ((!uzumSession || !uzumSession.token) && process.env.AUTO_LOGIN === 'true') {
        const autoUser = process.env.UZUM_USERNAME;
        const autoPass = process.env.UZUM_PASSWORD;
        if (autoUser && autoPass) {
          uzumSession = await this.uzumAuthService.loginToUzum(autoUser, autoPass);
        }
      }

      if (!uzumSession || !uzumSession.token) {
        throw new UnauthorizedException('Invalid credentials for Uzum API');
      }

      // 4. Uzum login successful, save user to local DB
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Determine if identifier is email (simple regex)
      const isEmail = identifier.includes('@');
      
      user = await this.prisma.user.create({
        data: {
          phone: isEmail ? 'UNKNOWN_' + Date.now() : identifier,
          email: isEmail ? identifier : null,
          password: hashedPassword,
          name: uzumSession.name || 'Uzum Seller',
          role: 'ADMIN',
          uzumToken: uzumSession.token,
        },
      });

      // 5. Trigger shop sync (this can be asynchronous or awaited)
      await this.uzumAuthService.syncShopsForUser(user.id, uzumSession.token);
    }

    // 6. Generate our own JWT tokens
    const payload = { sub: user.id, phone: user.phone, role: user.role };
    
    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '30d' }), // In real app, save to Redis
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        name: user.name,
        role: user.role,
      }
    };
  }
}
