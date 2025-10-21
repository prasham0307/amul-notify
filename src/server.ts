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

// Wait for Redis to be ready before starting the app
const waitForRedis = async () => {
  return new Promise<void>((resolve) => {
    // Check if already connected
    if (redis.status === 'ready' || redis.status === 'connect') {
      console.log('✅ Redis already connected')
      resolve()
      return
    }

    let resolved = false

    redis.once('ready', () => {
      if (!resolved) {
        resolved = true
        console.log('✅ Redis connection ready')
        resolve()
      }
    })

    redis.once('connect', () => {
      if (!resolved) {
        resolved = true
        console.log('✅ Redis connected')
        resolve()
      }
    })

    // Timeout after 10 seconds and continue anyway
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        // Check one more time before warning
        if (redis.status === 'ready' || redis.status === 'connect') {
          console.log('✅ Redis connected (detected on timeout check)')
        } else {
          console.warn('⚠️ Redis connection timeout - continuing without Redis')
        }
        resolve()
      }
    }, 10000)
  })
}

const startServer = async () => {
  try {
    // Wait for Redis
    await waitForRedis()

    // Connect to MongoDB
    await mongoose.connect(env.MONGO_URI)
    console.log('✅ Connected to MongoDB successfully')

    // Clean up old MongoDB indexes
    try {
      await mongoose.connection.db?.collection('users').dropIndex('userId_1')
      console.log('✅ Dropped old userId index')
    } catch (err: any) {
      if (err.code === 27 || err.codeName === 'IndexNotFound') {
        // Index doesn't exist - that's fine
        console.log('ℹ️ userId index does not exist (already cleaned)')
      } else {
        console.log('⚠️ Index cleanup warning:', err.message)
      }
    }

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

    // Start Express server
    app.listen(env.PORT, () => {
      console.log(`✅ Server is running on port ${env.PORT}`)
    })

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
    process.exit(1)
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('⚠️ Shutting down gracefully...')
  await redis.quit()
  await mongoose.disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('⚠️ Shutting down gracefully...')
  await redis.quit()
  await mongoose.disconnect()
  process.exit(0)
})

// Start the server
startServer()
