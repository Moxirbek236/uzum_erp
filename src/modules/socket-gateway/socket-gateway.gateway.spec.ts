import { Test, TestingModule } from '@nestjs/testing';
import { SocketGatewayGateway } from './socket-gateway.gateway';

describe('SocketGatewayGateway', () => {
  let gateway: SocketGatewayGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SocketGatewayGateway],
    }).compile();

    gateway = module.get<SocketGatewayGateway>(SocketGatewayGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
