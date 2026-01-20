// DNS Configuration - MUST be at the very top before any imports
import dns from 'dns'
dns.setServers(['8.8.8.8', '1.1.1.1'])
console.log('Using DNS servers:', dns.getServers())

// Now all other imports
import mongoose from 'mongoose'
import env from '@/env'
import bot from '@/bot'
import redis from '@/redis'
import { stockCheckerJob } from './jobs/checker.job'
import { initiateAmulSessions } from './services/amul.service'
import app from '@/app'
import { activityNotifierJob } from './jobs/activityReport.job'

// Wait for Redis with a shorter timeout
const waitForRedis = async () => {
  return new Promise<void>((resolve) => {
    // Check if already connected
    if (redis.status === 'ready' || redis.status === 'connect') {
      console.log('✅ Redis connection ready')
      resolve()
      return
    }

    let resolved = false

    const onReady = () => {
      if (!resolved) {
        resolved = true
        console.log('✅ Redis connection established')
        resolve()
      }
    }

    const onConnect = () => {
      if (!resolved) {
        resolved = true
        console.log('✅ Redis connected')
        resolve()
      }
    }

    const onError = (err: Error) => {
      console.error('❌ Redis connection error:', err.message)
      if (!resolved) {
        resolved = true
        console.warn('⚠️ Continuing without Redis due to connection error')
        resolve()
      }
    }

    redis.once('ready', onReady)
    redis.once('connect', onConnect)
    redis.once('error', onError)

    // Timeout after 5 seconds instead of 10
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        redis.off('ready', onReady)
        redis.off('connect', onConnect)
        redis.off('error', onError)

        // Check one more time before warning
        if (redis.status === 'ready' || redis.status === 'connect') {
          console.log('✅ Redis connected (detected on timeout check)')
        } else {
          console.warn(
            '⚠️ Redis connection timeout (5s) - continuing without Redis'
          )
        }
        resolve()
      }
    }, 5000)
  })
}

// Database maintenance function
const performDatabaseMaintenance = async () => {
  try {
    console.log('🔧 Performing database maintenance...')

    const usersCollection = mongoose.connection.db?.collection('users')

    if (usersCollection) {
      try {
        await usersCollection.dropIndex('userId_1')
        console.log('✅ Dropped old userId index')
      } catch (err: any) {
        if (err.code === 27 || err.codeName === 'IndexNotFound') {
          console.log('ℹ️ userId index does not exist (already cleaned)')
        }
      }

      // Verify current indexes
      try {
        const indexes = await usersCollection.indexes()
        console.log(
          '📋 Current user indexes:',
          indexes.map((idx) => idx.name).join(', ')
        )
      } catch (err) {
        console.log('⚠️ Could not list indexes:', err)
      }
    }

    console.log('✅ Database maintenance completed')
  } catch (err) {
    console.error('❌ Database maintenance error:', err)
  }
}

const startServer = async () => {
  try {
    // --- STEP 1: START HTTP SERVER IMMEDIATELY ---
    // This fixes the "No open ports" error on Render by opening the door instantly.

    app.get('/', (req: any, res: any) => {
      res.status(200).send('Amul Notify Bot is Alive!')
    })

    const PORT = Number(process.env.PORT) || 10000
    // Bind to 0.0.0.0 to ensure external access
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server is running immediately on port ${PORT}`)
    })

    // --- STEP 2: INITIALIZE BACKEND IN BACKGROUND ---
    console.log('⏳ Initializing backend services (DB, Redis, Amul)...')

    // Wait for Redis (with timeout)
    await waitForRedis()

    // Connect to MongoDB
    await mongoose.connect(env.MONGO_URI)
    console.log('✅ Connected to MongoDB successfully')

    // Perform database maintenance
    await performDatabaseMaintenance()

    // Initialize Amul sessions
    await initiateAmulSessions()

    // Setup bot
    if (env.BOT_WEBHOOK_URL) {
      const botSecret = `amul_${bot.secretPathComponent()}`
      console.log(`Setting webhook to: ${env.BOT_WEBHOOK_URL}`)
      await bot.telegram.setWebhook(env.BOT_WEBHOOK_URL, {
        secret_token: botSecret
      })

      const url = new URL(env.BOT_WEBHOOK_URL)
      const hookPath = url.pathname.endsWith('/')
        ? url.pathname.slice(0, -1)
        : url.pathname

      app.use(hookPath, (req, res) => {
        if (req.get('X-Telegram-Bot-Api-Secret-Token') !== botSecret) {
          console.error('Invalid secret token')
          return res.status(403).end()
        }

        bot.handleUpdate(req.body, res).catch((err) => {
          console.error('Error in bot.handleUpdate:', err)
          res.status(200).end()
        })
      })

      console.log('✅ Bot is running with webhook mode...')
      const webhookInfo = await bot.telegram.getWebhookInfo()
      console.log('Webhook info:', webhookInfo)
    } else {
      await bot.launch()
      console.log('✅ Bot is running in polling mode...')
    }

    // Start jobs
    if (env.TRACKER_ENABLED) {
      console.log('Starting stock checker job...')
      stockCheckerJob.start()
      stockCheckerJob.execute()
      console.log('✅ Stock checker job started')

      console.log('Starting activity notifier job...')
      activityNotifierJob.start()
      console.log('✅ Activity notifier job started')
    } else {
      console.log('⚠️ Stock tracker is disabled. Skipping job execution.')
    }
  } catch (err) {
    console.error('❌ Failed to start server:', err)
    // We do NOT exit process here, so the web server stays alive to show logs
  }
}

// Handle graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`⚠️ ${signal} received - Shutting down gracefully...`)

  try {
    // Stop jobs first
    if (env.TRACKER_ENABLED) {
      console.log('Stopping jobs...')
      stockCheckerJob.stop()
      activityNotifierJob.stop()
      console.log('✅ Jobs stopped')
    }

    // Close bot
    console.log('Stopping bot...')
    await bot.stop(signal)
    console.log('✅ Bot stopped')

    // Close Redis connection
    if (redis.status !== 'end') {
      console.log('Closing Redis connection...')
      await redis.quit()
      console.log('✅ Redis closed')
    }

    // Close MongoDB connection
    console.log('Closing MongoDB connection...')
    await mongoose.disconnect()
    console.log('✅ MongoDB closed')

    console.log('✅ Graceful shutdown completed')
    process.exit(0)
  } catch (err) {
    console.error('❌ Error during shutdown:', err)
    process.exit(1)
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err)
  gracefulShutdown('uncaughtException')
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason)
  gracefulShutdown('unhandledRejection')
})

// Start the server
startServer()
