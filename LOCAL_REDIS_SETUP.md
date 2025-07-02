# Redis Setup Guide for Local Development

## Option 1: Docker (Recommended)

### 1. Install Docker Desktop

- Download from: https://www.docker.com/products/docker-desktop/
- Install and start Docker Desktop

### 2. Run Redis Container

```bash
# Pull and run Redis container
docker run -d --name redis-quiz -p 6379:6379 redis:latest

# Verify Redis is running
docker ps
```

### 3. Test Redis Connection

```bash
# Connect to Redis CLI
docker exec -it redis-quiz redis-cli

# Test basic commands
ping
# Should return: PONG

# Exit Redis CLI
exit
```

## Option 2: Windows Direct Installation

### 1. Download Redis for Windows

- Download from: https://github.com/microsoftarchive/redis/releases
- Or use Windows Subsystem for Linux (WSL)

### 2. Install and Start

```bash
# If using WSL
sudo apt update
sudo apt install redis-server

# Start Redis server
redis-server

# In another terminal, test connection
redis-cli ping
```

## Environment Configuration

### 1. Update .env file

Make sure your `.env` file has:

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Database (update with your local database)
DATABASE_URL="your-database-connection-string"

# JWT
JWT_SECRET=your-jwt-secret-key
JWT_EXPIRES_IN=24h
```

### 2. Verify Configuration

Your application should connect to Redis automatically when you start it.

## Testing Redis Connection

### 1. Start your NestJS application

```bash
npm run start:dev
```

### 2. Check logs for Redis connection

You should see logs indicating successful Redis connection.

### 3. Test Redis functionality

Use the Postman tests provided to verify caching is working.

## Troubleshooting

### Common Issues:

1. **Connection Refused**
   - Make sure Redis is running: `docker ps` or `redis-cli ping`
   - Check port 6379 is not blocked

2. **Docker Issues**
   - Restart Docker Desktop
   - Remove and recreate container: `docker rm -f redis-quiz`

3. **Performance Issues**
   - Redis should be very fast locally
   - Check Docker resource allocation in Docker Desktop settings

### Redis CLI Commands for Debugging:

```bash
# Connect to Redis
docker exec -it redis-quiz redis-cli

# List all keys
keys *

# Get specific key
get "quiz:QUIZ_ID:questions"

# Clear all data (be careful!)
flushall

# Exit
exit
```

## Memory and Performance

### Local Development Settings:

- Default Redis memory limit is usually sufficient for testing
- For production, configure memory limits in docker run command:

```bash
docker run -d --name redis-quiz -p 6379:6379 -m 512m redis:latest
```

### Monitoring:

```bash
# Check Redis info
docker exec -it redis-quiz redis-cli info memory
```

Your Redis setup is now ready for local quiz testing!
