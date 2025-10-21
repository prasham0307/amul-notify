// DNS Configuration - MUST be at the very top before any imports
import dns from 'dns'
dns.setServers(['8.8.8.8', '1.1.1.1'])
console.log('Using DNS servers:', dns.getServers())

import { Redis } from 'ioredis'
import env from '@/env'

// Use REDIS_PUBLIC_URL which uses external network (more reliable than internal DNS)
const redisUrl = env.REDIS_PUBLIC_URL || env.REDIS_PRIVATE_URL || env.REDIS_URL

if (redisUrl) {
  console.log('📡 Using Redis public URL')
} else {
  console.log('⚠️ No Redis URL found, using localhost')
}

const redis = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: null, // null = unlimited retries (recommended for production)
      connectTimeout: 10000, // Increased to 10s for stability
      commandTimeout: 5000,
      family: 4,
      retryStrategy: (times) => {
        if (times > 10) {
          console.error('❌ Redis connection failed after 10 retries')
          return null // Stop retrying after 10 attempts
        }
        const delay = Math.min(times * 1000, 5000) // Exponential backoff up to 5s
        console.log(
          `🔄 Retrying Redis connection in ${delay}ms (attempt ${times}/10)`
        )
        return delay
      },
      lazyConnect: false,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      keepAlive: 30000, // Keep connection alive
      reconnectOnError: (err) => {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT']
        return targetErrors.some((target) => err.message.includes(target))
      }
    })
  : new Redis({
      host: env.REDIS_HOST || 'localhost',
      port: env.REDIS_PORT || 6379,
      password: env.REDISPASSWORD,
      db: env.REDIS_DATABASE_INDEX,
      maxRetriesPerRequest: null,
      connectTimeout: 10000,
      commandTimeout: 5000,
      family: 4,
      retryStrategy: (times) => {
        if (times > 10) {
          console.error('❌ Redis connection failed after 10 retries')
          return null
        }
        const delay = Math.min(times * 1000, 5000)
        return delay
      },
      lazyConnect: false,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      keepAlive: 30000
    })

redis.on('error', (err) => {
  console.error('❌ Redis error:', err.message || err)
  // Don't crash on Redis errors - let retry logic handle it
})

redis.on('connect', () => {
  console.log('✅ Connected to Redis successfully')
})

redis.on('ready', () => {
  console.log('✅ Redis is ready to accept commands')
})

redis.on('reconnecting', () => {
  console.log('🔄 Redis is reconnecting...')
})

redis.on('close', () => {
  console.log('⚠️ Redis connection closed')
})

redis.on('end', () => {
  console.log('⚠️ Redis connection ended')
})

// Add a health check method
export const isRedisHealthy = (): boolean => {
  return redis.status === 'ready' || redis.status === 'connect'
}

// Export a safe get wrapper with timeout
export const safeRedisGet = async (key: string): Promise<string | null> => {
  try {
    if (!isRedisHealthy()) {
      console.warn('⚠️ Redis not healthy, skipping GET')
      return null
    }

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 3000) // 3s timeout
    })

    const result = await Promise.race([redis.get(key), timeoutPromise])

    return result
  } catch (err) {
    console.error('❌ Redis GET error:', err)
    return null
  }
}

// Export a safe set wrapper with timeout
export const safeRedisSet = async (
  key: string,
  value: string,
  expirySeconds?: number
): Promise<boolean> => {
  try {
    if (!isRedisHealthy()) {
      console.warn('⚠️ Redis not healthy, skipping SET')
      return false
    }

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), 3000) // 3s timeout
    })

    const setPromise = async () => {
      if (expirySeconds) {
        await redis.setex(key, expirySeconds, value)
      } else {
        await redis.set(key, value)
      }
      return true
    }

    const result = await Promise.race([setPromise(), timeoutPromise])

    return result
  } catch (err) {
    console.error('❌ Redis SET error:', err)
    return false
  }
}

// Export a safe delete wrapper
export const safeRedisDel = async (key: string): Promise<boolean> => {
  try {
    if (!isRedisHealthy()) {
      console.warn('⚠️ Redis not healthy, skipping DEL')
      return false
    }
    await redis.del(key)
    return true
  } catch (err) {
    console.error('❌ Redis DEL error:', err)
    return false
  }
}

// Export a safe exists wrapper
export const safeRedisExists = async (key: string): Promise<boolean> => {
  try {
    if (!isRedisHealthy()) {
      return false
    }
    const result = await redis.exists(key)
    return result === 1
  } catch (err) {
    console.error('❌ Redis EXISTS error:', err)
    return false
  }
}

export default redis
