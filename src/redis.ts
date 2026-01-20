// DNS Configuration - MUST be at the very top before any imports
// import dns from 'dns'
// dns.setServers(['8.8.8.8', '1.1.1.1'])

import { Redis, RedisOptions } from 'ioredis'
import env from '@/env'

// Use REDIS_PUBLIC_URL which uses external network (more reliable than internal DNS)
const redisUrl = env.REDIS_PUBLIC_URL || env.REDIS_PRIVATE_URL || env.REDIS_URL

// Common Redis options
const commonOptions: RedisOptions = {
  maxRetriesPerRequest: null, // CRITICAL: null means no limit per request
  connectTimeout: 15000,
  commandTimeout: 10000,
  family: 4,
  retryStrategy: (times: number) => Math.min(times * 500, 3000),
  lazyConnect: false,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  keepAlive: 30000,
  reconnectOnError: (err: Error) => {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED']
    return targetErrors.some((target) => err.message.includes(target))
  },
}

// --- FACTORY FUNCTION ---
export const createRedisConnection = (): Redis => {
  return redisUrl
    ? new Redis(redisUrl, commonOptions)
    : new Redis({
        host: env.REDIS_HOST || 'localhost',
        port: env.REDIS_PORT || 6379,
        password: env.REDISPASSWORD,
        db: env.REDIS_DATABASE_INDEX,
        ...commonOptions,
      })
}

// --- EXPORT THE SHARED CONNECTION ---
// This fixes the "red squiggle" because we now export 'connection' explicitly
export const connection = createRedisConnection()

// Keep default export for backward compatibility if needed
export default connection

// Event listeners
connection.on('error', (err) => console.error('❌ Redis error:', err.message || err))
connection.on('connect', () => console.log('✅ Connected to Redis successfully'))
connection.on('ready', () => console.log('✅ Redis is ready to accept commands'))

// Helper functions (Optional, kept from your original code)
export const closeRedis = async (): Promise<void> => {
  try {
    await connection.quit()
    console.log('✅ Redis connection closed gracefully')
  } catch (err) {
    console.error('❌ Error closing Redis:', err)
    connection.disconnect()
  }
}