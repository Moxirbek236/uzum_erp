import { Test, TestingModule } from '@nestjs/testing';
import { UzumShopService } from './uzum-shop.service';

describe('UzumShopService', () => {
  let service: UzumShopService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UzumShopService],
    }).compile();

    service = module.get<UzumShopService>(UzumShopService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
