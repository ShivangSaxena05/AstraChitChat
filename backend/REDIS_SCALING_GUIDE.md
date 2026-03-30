# 🚀 Socket.IO Scaling Guide

## Single Instance (Development)
- ✅ Works out of the box
- 🟡 In-memory adapter (room state lost on restart)
- 🟡 Cannot scale horizontally

**Console output:**
```
⚡ Using in-memory adapter (single instance only)
```

---

## Multiple Instances with Redis (Production)

### Prerequisites
1. **Redis Server** running (local or cloud)
   - Local: `redis-server`
   - Cloud: Redis Cloud, AWS ElastiCache, etc.

2. **Install Redis packages:**
   ```bash
   npm install @socket.io/redis-adapter redis
   ```

### Configuration

Set ONE of these in `.env`:

#### Option A: Redis URL (Recommended)
```env
REDIS_URL=redis://localhost:6379
# Or with authentication:
REDIS_URL=redis://:password@localhost:6379
# Or with cloud service:
REDIS_URL=redis://default:password@redis-cloud-host.com:port
```

#### Option B: Separate Host/Port
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional-password
```

### How It Works

**Before (Single Instance):**
```
Server 1: Rooms only in Server 1's memory
Server 2: Rooms only in Server 2's memory
❌ Messages don't sync between instances
```

**After (With Redis):**
```
Server 1 ──┐
           ├─→ Redis Pub/Sub ──→ Syncs all rooms & messages
Server 2 ──┘
✅ Any instance can reach any room
✅ Horizontal scaling works
```

### Verification

Start your server and check logs:

**With Redis connected:**
```
✅ Redis connected - Socket.IO will sync across multiple instances
🔴 Redis adapter attached to Socket.IO
```

**Without Redis (fallback):**
```
⚠️ REDIS_URL not configured - Socket.IO rooms will NOT sync across instances
⚡ Using in-memory adapter (single instance only)
```

---

## Deployment Examples

### Heroku with Redis Cloud
```env
REDIS_URL=redis://default:abc123@redis-12345.c123.us-east-1-2.ec2.cloud.redislabs.com:12345
```

### AWS with ElastiCache
```env
REDIS_URL=redis://my-redis-cluster.abc123.ng.0001.use1.cache.amazonaws.com:6379
```

### Docker Compose (Local Testing)
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      REDIS_URL: redis://redis:6379
    depends_on:
      - redis
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

---

## Performance Impact

| Metric | Single Instance | With Redis |
|--------|-----------------|-----------|
| Room sync latency | <1ms (local) | ~10-50ms (network) |
| Memory usage | Low | Moderate (+Redis) |
| Horizontal scaling | ❌ No | ✅ Yes |
| Max concurrent users | ~10k | ~100k+ (multiple servers) |

---

## Troubleshooting

### Redis connection fails
```
⚠️ Redis connection failed, falling back to in-memory adapter
```
**Fix:**
- Verify Redis server is running
- Check `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT` in `.env`
- Ensure firewall allows access to Redis port

### Messages not syncing between instances
- Confirm Redis is connected (check console logs)
- Verify both instances use same `REDIS_URL`
- Check Redis is accessible from all servers

### Redis packages not installed
```
Error: Cannot find module '@socket.io/redis-adapter'
```
**Fix:**
```bash
npm install @socket.io/redis-adapter redis
```

---

## Security Best Practices

1. **Use authentication:**
   ```env
   REDIS_URL=redis://:strong-password@redis-host:6379
   ```

2. **Use TLS/SSL for cloud Redis:**
   ```env
   REDIS_URL=rediss://default:password@host:port
   ```

3. **Restrict Redis access:**
   - Only allow server IPs to connect
   - Use VPC/security groups

4. **Monitor Redis:**
   - Watch for high memory usage
   - Monitor connection count
   - Set up alerts for failures

---

## Next Steps

✅ **Development:** Works as-is (no Redis needed)
✅ **Testing:** Set up local Redis with Docker
✅ **Production:** Set `REDIS_URL` to your cloud Redis service

