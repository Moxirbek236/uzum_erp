import { Test, TestingModule } from '@nestjs/testing';
import { UzumReviewService } from './uzum-review.service';

describe('UzumReviewService', () => {
  let service: UzumReviewService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UzumReviewService],
    }).compile();

    service = module.get<UzumReviewService>(UzumReviewService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
