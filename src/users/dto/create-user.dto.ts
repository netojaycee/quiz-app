import { UserRole } from '@prisma/client';
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
// import { UserRole } from '../entities/user.entity';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole = UserRole.CONTESTANT;
}
