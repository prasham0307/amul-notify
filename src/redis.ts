import { Redis } from 'ioredis'
import env from '@/env'

// Use REDIS_URL if provided (for Railway/production), otherwise use individual parameters (for local)
const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error('Redis connection failed after 3 retries')
          return null // Stop retrying
        }
        const delay = Math.min(times * 200, 2000)
        return delay
      }
    })
  : new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      db: env.REDIS_DATABASE_INDEX,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error('Redis connection failed after 3 retries')
          return null // Stop retrying
        }
        const delay = Math.min(times * 200, 2000)
        return delay
      }
    })

redis.on('error', (err) => {
  console.error('Failed to connect to Redis:', err)
})

redis.on('connect', () => {
  console.log('Connected to Redis successfully')
})

redis.on('ready', () => {
  console.log('Redis is ready to accept commands')
})

redis.on('reconnecting', () => {
  console.log('Redis is reconnecting...')
})

export default redis