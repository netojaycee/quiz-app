import { UserRole } from '@prisma/client';
import { Exclude, Transform } from 'class-transformer';
// import { UserRole } from '../entities/user.entity';

export class UserResponseDto {
  id: string;
  username: string;
  role: UserRole;

  @Transform(({ value }) => value.toISOString())
  createdAt: Date;

  @Transform(({ value }) => value.toISOString())
  updatedAt: Date;

  @Exclude()
  password: string;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
