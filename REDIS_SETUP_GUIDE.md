# Redis Setup Guide

Redis is required for caching quiz data and managing real-time quiz sessions.

## Installation

### Windows

1. **Using Windows Subsystem for Linux (WSL) - Recommended:**

   ```bash
   # Install WSL if not already installed
   wsl --install

   # Install Redis in WSL
   sudo apt update
   sudo apt install redis-server

   # Start Redis
   sudo service redis-server start

   # Test Redis
   redis-cli ping
   ```

2. **Using Docker:**

   ```bash
   # Pull and run Redis container
   docker run -d --name quiz-redis -p 6379:6379 redis:latest

   # Test connection
   docker exec -it quiz-redis redis-cli ping
   ```

3. **Using Redis for Windows (Legacy):**
   - Download from: https://github.com/microsoftarchive/redis/releases
   - Install and run as service

### macOS

```bash
# Using Homebrew
brew install redis

# Start Redis
brew services start redis

# Test Redis
redis-cli ping
```

### Linux (Ubuntu/Debian)

```bash
# Install Redis
sudo apt update
sudo apt install redis-server

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Test Redis
redis-cli ping
```

## Configuration

### 1. Environment Variables

Add to your `.env` file:

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### 2. Redis Configuration (Optional)

For production, you may want to configure Redis:

```bash
# Edit Redis config
sudo nano /etc/redis/redis.conf

# Key settings:
# bind 127.0.0.1
# port 6379
# requirepass your_secure_password
# maxmemory 256mb
# maxmemory-policy allkeys-lru
```

## Testing Redis Connection

### 1. Command Line Test

```bash
# Connect to Redis
redis-cli

# Test basic operations
127.0.0.1:6379> ping
PONG
127.0.0.1:6379> set test "Hello Redis"
OK
127.0.0.1:6379> get test
"Hello Redis"
127.0.0.1:6379> exit
```

### 2. Node.js Test

Create a test file `test-redis.js`:

```javascript
const redis = require('redis');

async function testRedis() {
  const client = redis.createClient({
    socket: {
      host: 'localhost',
      port: 6379,
    },
  });

  try {
    await client.connect();
    console.log('✅ Connected to Redis');

    await client.set('test-key', 'test-value');
    const value = await client.get('test-key');
    console.log('✅ Redis read/write test:', value);

    await client.del('test-key');
    console.log('✅ Redis cleanup successful');
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
  } finally {
    await client.quit();
  }
}

testRedis();
```

Run the test:

```bash
node test-redis.js
```

## Quiz System Redis Usage

### Key Patterns Used

```
quiz:{quizId}:questions - All questions for a quiz
quiz:{quizId}:round:{roundId}:questions - Questions for specific round
quiz:{quizId}:participants - Participant order
quiz:{quizId}:active_participant - Current active participant
quiz:{quizId}:current_question - Current question index
quiz:{quizId}:answered_questions - List of answered question IDs
quiz:{quizId}:session - Quiz session state
quiz:{quizId}:pending_answer:{userId} - Pending answers for confirmation
```

### Data Stored

- **Questions:** Cached at round start for fast access
- **Participant Order:** For sequential question answering
- **Active State:** Current active participant and question
- **Session Data:** Round timing, progress, state
- **Validation Data:** Question answers for quick validation

### Performance Benefits

- **Reduced DB Load:** Questions cached in memory
- **Fast Validation:** Answer checking without DB queries
- **Real-time State:** Instant access to quiz state
- **Session Management:** Efficient handling of active sessions

## Monitoring Redis

### 1. Redis CLI Monitoring

```bash
# Monitor all Redis commands
redis-cli monitor

# Check memory usage
redis-cli info memory

# List all keys
redis-cli keys "*"

# Check specific quiz data
redis-cli keys "quiz:*"
```

### 2. Redis Memory Usage

```bash
# Check memory usage
redis-cli info memory | grep used_memory_human

# Check key count
redis-cli dbsize

# Flush all data (BE CAREFUL!)
redis-cli flushall
```

## Troubleshooting

### Connection Issues

```bash
# Check if Redis is running
ps aux | grep redis
# or
systemctl status redis-server

# Check port availability
netstat -tlnp | grep 6379
# or
lsof -i :6379
```

### Memory Issues

```bash
# Check Redis memory
redis-cli info memory

# Set memory limit (in redis.conf)
# maxmemory 256mb
# maxmemory-policy allkeys-lru
```

### Performance Tuning

```bash
# Disable persistence for better performance (if data loss is acceptable)
# In redis.conf:
# save ""
# appendonly no
```

## Security (Production)

### 1. Password Protection

```bash
# In redis.conf
requirepass your_secure_password
```

```env
# In .env
REDIS_PASSWORD=your_secure_password
```

### 2. Network Security

```bash
# Bind to localhost only (in redis.conf)
bind 127.0.0.1

# Or bind to specific IPs
bind 127.0.0.1 192.168.1.100
```

### 3. Firewall Rules

```bash
# Ubuntu/Debian
sudo ufw allow from 192.168.1.0/24 to any port 6379

# Or restrict to localhost only
sudo ufw deny 6379
```

## Docker Compose Setup (Optional)

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  redis:
    image: redis:latest
    container_name: quiz-redis
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped

volumes:
  redis_data:
```

Run with:

```bash
docker-compose up -d redis
```

## Production Considerations

1. **Persistence:** Enable AOF or RDB for data persistence
2. **Memory Management:** Set appropriate memory limits
3. **Monitoring:** Use Redis monitoring tools
4. **Clustering:** Consider Redis Cluster for high availability
5. **Backup:** Regular backups of Redis data
6. **Security:** Password protection and network restrictions

## Integration with Quiz System

The quiz system automatically:

1. **Caches questions** when rounds start
2. **Manages participant state** during sequential rounds
3. **Validates answers** using cached data
4. **Clears cache** when quiz sessions end
5. **Handles session timeouts** with TTL values

Redis is essential for the real-time features and performance of the quiz system.
