import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3400',
    credentials: true,
  },
})
export class SocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('SocketGateway');
  private connectedUsers = new Map<string, { socket: Socket; user: any }>();

  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
  ) { }

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const user = await this.usersService.findOne(payload.sub);

      if (!user) {
        this.logger.warn(`Invalid user for client ${client.id}`);
        client.disconnect();
        return;
      }

      this.connectedUsers.set(client.id, { socket: client, user });
      client.data.user = user;

      this.logger.log(`Client ${client.id} connected as ${user.username} (${user.role})`);

      // Join role-based rooms
      client.join(`role:${user.role}`);
      client.join(`user:${user.id}`);

      // Notify others about connection
      this.server.emit('userConnected', {
        userId: user.id,
        username: user.username,
        role: user.role,
      });

      // Send current online users to the newly connected client
      const onlineUsers = Array.from(this.connectedUsers.values()).map(({ user }) => ({
        id: user.id,
        username: user.username,
        role: user.role,
      }));

      client.emit('onlineUsers', onlineUsers);

    } catch (error) {
      this.logger.error(`Connection error for client ${client.id}:`, error.message);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userConnection = this.connectedUsers.get(client.id);

    if (userConnection) {
      const { user } = userConnection;
      this.connectedUsers.delete(client.id);

      this.logger.log(`Client ${client.id} (${user.username}) disconnected`);

      // Notify others about disconnection
      this.server.emit('userDisconnected', {
        userId: user.id,
        username: user.username,
        role: user.role,
      });
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('sendMessage')
  handleMessage(
    @MessageBody() data: { message: string; target?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;

    const messageData = {
      id: Date.now().toString(),
      message: data.message,
      sender: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      timestamp: new Date().toISOString(),
    };

    if (data.target) {
      // Send to specific user
      this.server.to(`user:${data.target}`).emit('newMessage', messageData);
    } else {
      // Broadcast to all users
      this.server.emit('newMessage', messageData);
    }

    this.logger.log(`Message from ${user.username}: ${data.message}`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @MessageBody() data: { room: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(data.room);
    const user = client.data.user;

    this.logger.log(`${user.username} joined room: ${data.room}`);

    client.to(data.room).emit('userJoinedRoom', {
      room: data.room,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @MessageBody() data: { room: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(data.room);
    const user = client.data.user;

    this.logger.log(`${user.username} left room: ${data.room}`);

    client.to(data.room).emit('userLeftRoom', {
      room: data.room,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  }

  // Utility methods for sending messages from other services
  sendToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  sendToRole(role: string, event: string, data: any) {
    this.server.to(`role:${role}`).emit(event, data);
  }

  sendToRoom(room: string, event: string, data: any) {
    this.server.to(room).emit(event, data);
  }

  broadcastToAll(event: string, data: any) {
    this.server.emit(event, data);
  }

  getOnlineUsers() {
    return Array.from(this.connectedUsers.values()).map(({ user }) => ({
      id: user.id,
      username: user.username,
      role: user.role,
    }));
  }
}
