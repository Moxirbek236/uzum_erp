import { Test, TestingModule } from '@nestjs/testing';
import { UzumAuthService } from './uzum-auth.service';

describe('UzumAuthService', () => {
  let service: UzumAuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UzumAuthService],
    }).compile();

    service = module.get<UzumAuthService>(UzumAuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
