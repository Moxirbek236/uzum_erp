import { Server } from 'socket.io';
export declare class SocketGatewayGateway {
    server: Server;
    handleMessage(client: any, payload: any): string;
}
