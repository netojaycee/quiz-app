// export enum UserRole {
//   MODERATOR = 'MODERATOR',
//   CONTESTANT = 'CONTESTANT',
// }

import { UserRole } from "@prisma/client";

export interface User {
  id: string;
  username: string;
  password: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}
