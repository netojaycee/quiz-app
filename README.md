# Teenage Quiz Backend

A NestJS backend application with PostgreSQL, Prisma, Socket.IO, and JWT authentication.

## Features

- **Authentication**: JWT-based authentication with username/password
- **Authorization**: Role-based access control (Moderator/Contestant)
- **Real-time Communication**: Socket.IO integration with authentication
- **Database**: PostgreSQL with Prisma ORM
- **Validation**: Class validators and transformers
- **CORS**: Configurable CORS support

## User Roles

- **MODERATOR**: Full access to user management and quiz operations
- **CONTESTANT**: Participant access for quiz participation

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Copy the example environment file and update with your values:

```bash
cp .env.example .env
```

Update the following variables in `.env`:

- `DATABASE_URL`: Your PostgreSQL connection string
- `JWT_SECRET`: A strong secret for JWT tokens
- `CORS_ORIGIN`: Your frontend URL

### 3. Database Setup

Make sure PostgreSQL is running, then:

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# (Optional) Open Prisma Studio to view data
npx prisma studio
```

### 4. Start the Application

```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

The server will start on `http://localhost:3000`

## API Endpoints

### Authentication

- `POST /auth/register` - Register a new user
- `POST /auth/login` - Login with username/password
- `GET /auth/profile` - Get current user profile (requires auth)

### Users (Moderator only)

- `GET /users` - Get all users
- `GET /users/:id` - Get user by ID
- `POST /users` - Create new user
- `PATCH /users/:id` - Update user
- `DELETE /users/:id` - Delete user

## Socket.IO Events

### Client → Server

- `sendMessage` - Send a message to all users or specific user
- `joinRoom` - Join a specific room
- `leaveRoom` - Leave a specific room

### Server → Client

- `userConnected` - User connected to the system
- `userDisconnected` - User disconnected from the system
- `newMessage` - New message received
- `userJoinedRoom` - User joined a room
- `userLeftRoom` - User left a room
- `onlineUsers` - List of currently online users

## Socket.IO Authentication

Include the JWT token in the socket connection:

```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token',
  },
});
```

## Database Schema

### User Model

- `id`: Unique identifier (CUID)
- `username`: Unique username
- `password`: Hashed password
- `role`: User role (MODERATOR | CONTESTANT)
- `createdAt`: Creation timestamp
- `updatedAt`: Update timestamp

## Development

### Useful Commands

```bash
# Format code
npm run format

# Lint code
npm run lint

# Run tests
npm run test

# Database operations
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:studio    # Open Prisma Studio
```

### Project Structure

```
src/
├── auth/                 # Authentication module
│   ├── decorators/       # Custom decorators
│   ├── dto/             # Data transfer objects
│   ├── guards/          # Authentication guards
│   └── strategies/      # Passport strategies
├── prisma/              # Database service
├── socket/              # Socket.IO gateway
│   └── guards/          # WebSocket guards
├── users/               # User management
│   ├── dto/             # Data transfer objects
│   └── entities/        # User entity
├── app.module.ts        # Main app module
└── main.ts              # Application entry point
```

## Environment Variables

| Variable         | Description                  | Default                 |
| ---------------- | ---------------------------- | ----------------------- |
| `NODE_ENV`       | Environment mode             | `development`           |
| `PORT`           | Server port                  | `3000`                  |
| `DATABASE_URL`   | PostgreSQL connection string | Required                |
| `JWT_SECRET`     | JWT signing secret           | Required                |
| `JWT_EXPIRES_IN` | JWT expiration time          | `7d`                    |
| `CORS_ORIGIN`    | Allowed CORS origin          | `http://localhost:3001` |

## Production Deployment

1. Set `NODE_ENV=production`
2. Use a strong `JWT_SECRET`
3. Configure proper `DATABASE_URL`
4. Set appropriate `CORS_ORIGIN`
5. Run `npm run build` and `npm run start:prod`

## Testing

```bash
# Unit tests
npm run test

# e2e tests
npm run test:e2e

# Test coverage
npm run test:cov
```
