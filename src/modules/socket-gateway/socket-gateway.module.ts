import { Module } from '@nestjs/common';
import { SocketGatewayGateway } from './socket-gateway.gateway';

@Module({
  providers: [SocketGatewayGateway],
  exports: [SocketGatewayGateway],
})
export class SocketGatewayModule {}
