import { Redis } from 'ioredis'
import env from '@/env'

// Priority: Individual Railway variables FIRST, then URL-based
let redisUrl: string | undefined

// Debug: Log what we have
console.log('🔍 Debug Redis vars:', {
  REDISHOST: env.REDISHOST,
  REDISPORT: env.REDISPORT,
  REDIS_URL: env.REDIS_URL ? 'exists' : 'missing',
  REDIS_PUBLIC_URL: env.REDIS_PUBLIC_URL ? 'exists' : 'missing'
})

// Try Railway individual variables first (these work better)
if (env.REDISHOST && env.REDISPORT) {
  const user = env.REDISUSER || 'default'
  const password = env.REDISPASSWORD || ''
  redisUrl = `redis://${user}:${password}@${env.REDISHOST}:${env.REDISPORT}`
  console.log('📡 Constructed Redis URL from Railway individual variables')
  console.log('🔍 Using host:', env.REDISHOST)
} else {
  // Fallback to URL-based connection
  redisUrl = env.REDIS_PRIVATE_URL || env.REDIS_URL
  if (redisUrl) {
    console.log('📡 Using Redis URL from environment')
  }
}

const redis = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      family: 4,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error('Redis connection failed after 3 retries')
          return null
        }
        const delay = Math.min(times * 1000, 3000)
        console.log(
          `Retrying Redis connection in ${delay}ms (attempt ${times})`
        )
        return delay
      },
      lazyConnect: true,
      enableReadyCheck: false,
      enableOfflineQueue: false
    })
  : new Redis({
      host: env.REDIS_HOST || env.REDISHOST || 'localhost',
      port: env.REDIS_PORT || env.REDISPORT || 6379,
      password: env.REDISPASSWORD,
      db: env.REDIS_DATABASE_INDEX,
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      family: 4,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error('Redis connection failed after 3 retries')
          return null
        }
        const delay = Math.min(times * 1000, 3000)
        return delay
      },
      lazyConnect: true,
      enableReadyCheck: false,
      enableOfflineQueue: false
    })

redis.on('error', (err) => {
  console.error('Redis error:', err.message || err)
})

redis.on('connect', () => {
  console.log('✅ Connected to Redis successfully')
})

redis.on('ready', () => {
  console.log('✅ Redis is ready to accept commands')
})

redis.on('reconnecting', () => {
  console.log('⚠️ Redis is reconnecting...')
})

redis.on('close', () => {
  console.log('⚠️ Redis connection closed')
})

const connectRedis = async () => {
  try {
    console.log('🔄 Attempting to connect to Redis...')
    await redis.connect()
    console.log('✅ Redis connection established')
  } catch (err) {
    console.error('❌ Failed to establish Redis connection:', err)
  }
}

connectRedis()

export default redis
