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

// Common Redis options
const commonOptions = {
  maxRetriesPerRequest: null, // CRITICAL: null means no limit per request
  connectTimeout: 15000, // Increased from 10s
  commandTimeout: 10000, // Increased from 5s
  family: 4, // IPv4
  retryStrategy: (times: number) => {
    // Never give up on connection retries (only affects connection, not commands)
    const delay = Math.min(times * 500, 3000) // Exponential backoff up to 3s
    console.log(`🔄 Retrying Redis connection in ${delay}ms (attempt ${times})`)
    return delay
  },
  lazyConnect: false,
  enableReadyCheck: true,
  enableOfflineQueue: true, // Keep commands queued during reconnection
  keepAlive: 30000,
  reconnectOnError: (err: Error) => {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED']
    const shouldReconnect = targetErrors.some((target) => err.message.includes(target))
    if (shouldReconnect) {
      console.log(`🔄 Reconnecting due to: ${err.message}`)
    }
    return shouldReconnect
  },
  // Additional stability options
  showFriendlyErrorStack: true,
  autoResubscribe: true,
  autoResendUnfulfilledCommands: true,
}

const redis = redisUrl
  ? new Redis(redisUrl, commonOptions)
  : new Redis({
      host: env.REDIS_HOST || 'localhost',
      port: env.REDIS_PORT || 6379,
      password: env.REDISPASSWORD,
      db: env.REDIS_DATABASE_INDEX,
      ...commonOptions,
    })

// Enhanced error handling
redis.on('error', (err) => {
  console.error('❌ Redis error:', err.message || err)
  // Don't crash - let retry logic handle it
})

redis.on('connect', () => {
  console.log('✅ Connected to Redis successfully')
})

redis.on('ready', () => {
  console.log('✅ Redis is ready to accept commands')
})

redis.on('reconnecting', (timeUntilReconnect: number) => {
  console.log(`🔄 Redis reconnecting in ${timeUntilReconnect}ms...`)
})

redis.on('close', () => {
  console.log('⚠️ Redis connection closed')
})

redis.on('end', () => {
  console.log('⚠️ Redis connection ended')
})

// Health check with more states
export const isRedisHealthy = (): boolean => {
  const healthyStates = ['ready', 'connect', 'connecting']
  return healthyStates.includes(redis.status)
}

// Safe wrapper with proper timeout handling
export const safeRedisGet = async (
  key: string,
  timeoutMs: number = 5000
): Promise<string | null> => {
  try {
    if (!isRedisHealthy()) {
      console.warn('⚠️ Redis not healthy, skipping GET')
      return null
    }

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        console.warn(`⚠️ Redis GET timed out after ${timeoutMs}ms for key: ${key}`)
        resolve(null)
      }, timeoutMs)
    })

    const result = await Promise.race([
      redis.get(key),
      timeoutPromise
    ])

    return result
  } catch (err) {
    console.error('❌ Redis GET error:', err)
    return null
  }
}

export const safeRedisSet = async (
  key: string,
  value: string,
  expirySeconds?: number,
  timeoutMs: number = 5000
): Promise<boolean> => {
  try {
    if (!isRedisHealthy()) {
      console.warn('⚠️ Redis not healthy, skipping SET')
      return false
    }

    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => {
        console.warn(`⚠️ Redis SET timed out after ${timeoutMs}ms for key: ${key}`)
        resolve(false)
      }, timeoutMs)
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

export const safeRedisDel = async (
  key: string,
  timeoutMs: number = 5000
): Promise<boolean> => {
  try {
    if (!isRedisHealthy()) {
      console.warn('⚠️ Redis not healthy, skipping DEL')
      return false
    }

    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), timeoutMs)
    })

    const result = await Promise.race([
      redis.del(key).then(() => true),
      timeoutPromise
    ])

    return result
  } catch (err) {
    console.error('❌ Redis DEL error:', err)
    return false
  }
}

export const safeRedisExists = async (
  key: string,
  timeoutMs: number = 5000
): Promise<boolean> => {
  try {
    if (!isRedisHealthy()) {
      return false
    }

    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), timeoutMs)
    })

    const result = await Promise.race([
      redis.exists(key).then(count => count === 1),
      timeoutPromise
    ])

    return result
  } catch (err) {
    console.error('❌ Redis EXISTS error:', err)
    return false
  }
}

// Graceful shutdown helper
export const closeRedis = async (): Promise<void> => {
  try {
    await redis.quit()
    console.log('✅ Redis connection closed gracefully')
  } catch (err) {
    console.error('❌ Error closing Redis:', err)
    redis.disconnect()
  }
}

export default redis