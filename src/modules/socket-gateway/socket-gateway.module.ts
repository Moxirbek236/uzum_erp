import { Module } from '@nestjs/common';
import { SocketGatewayGateway } from './socket-gateway.gateway';

@Module({
  providers: [SocketGatewayGateway]
})
export class SocketGatewayModule {}
