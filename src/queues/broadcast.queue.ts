import bot from '@/bot'
import UserModel from '@/models/user.model'
import ProductModel from '@/models/product.model'
import { emojis } from '@/utils/emoji.util'
import { Queue, Worker, QueueEvents } from 'bullmq'
import { TelegramError } from 'telegraf'
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types'
import { connection, createRedisConnection } from '@/redis'

// 1. Define the Queue (Producers add jobs here)
export const broadcastQueue = new Queue('broadcast', {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true
  }
})

// 2. Define the QueueEvents (To listen for "finished" events)
const queueEvents = new QueueEvents('broadcast', {
  connection: createRedisConnection()
})

// 3. Define the Worker (Consumers process jobs here)
export const broadcastWorker = new Worker(
  'broadcast',
  async (job) => {
    const { chatId, text, extra } = job.data

    try {
      const defaultExtra: ExtraReplyMessage = {
        parse_mode: 'HTML',
        disable_notification: false
      }

      Object.assign(defaultExtra, extra)

      await bot.telegram.sendMessage(chatId, text, defaultExtra)
      console.log(`${emojis.checkMark} Message sent to ${chatId}: ${text}`)
    } catch (error: any) {
      // --- ERROR HANDLING LOGIC ---
      if (error instanceof TelegramError) {
        const isBlocked =
          error.code === 403 ||
          error.toString().includes('bot was blocked by the user')

        if (isBlocked) {
          console.warn(`User ${chatId} blocked bot. Removing from DB.`)
          const deleteResponse = await UserModel.findOneAndDelete({
            tgId: Number(chatId)
          })
          if (deleteResponse?._id) {
            await ProductModel.deleteMany({ trackedBy: deleteResponse._id })
          }
        } else {
          console.error(`Telegram error for ${chatId}: ${error.description}`)
        }
      }
      console.error(
        `${emojis.crossMark} Failed to send to ${chatId}: ${error.message}`
      )
      throw error // Re-throw to mark job as failed
    }
  },
  {
    connection: createRedisConnection(), // CRITICAL: Use the factory
    concurrency: 5,
    limiter: {
      max: 30,
      duration: 2000
    }
  }
)

// 4. Helper function to add to queue
export const sendMessageQueue = async (payload: {
  chatId: number
  text: string
  extra?: ExtraReplyMessage
  onComplete: (error?: Error | TelegramError) => void
}) => {
  const job = await broadcastQueue.add(
    'send-message',
    {
      chatId: payload.chatId,
      text: payload.text,
      extra: payload.extra
    },
    {
      // FIX: Prefix with string and add timestamp to allow multiple messages
      jobId: `msg-${payload.chatId}-${Date.now()}`
    }
  )

  try {
    await job.waitUntilFinished(queueEvents)
    payload.onComplete()
  } catch (err) {
    console.error(`Job failed:`, err)
    payload.onComplete(err as Error | TelegramError)
  }
}
