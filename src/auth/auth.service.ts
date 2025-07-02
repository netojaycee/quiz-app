import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) { }

  async validateUser(username: string, password?: string): Promise<any> {
    const user = await this.usersService.findByUsername(username);

    if (!user) {
      return null;
    }

    // For moderators, password is required
    if (user.role === 'MODERATOR') {
      if (!password || !user.password) {
        return null;
      }
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return null;
      }
    }
    // For contestants, no password check needed
    else if (user.role === 'CONTESTANT') {
      // Password not required for contestants
    }

    const { password: userPassword, ...result } = user;
    return result;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.username, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { username: user.username, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    };
  }

  async profile(userId: string) {
    return this.usersService.findOne(userId);
  }
}
