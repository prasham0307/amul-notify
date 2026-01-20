import { BotCommand } from 'telegraf/typings/core/types/typegram'

// FIX: Use the ID from .env, or fallback to YOUR personal ID (not the old group)
// Fallback to process.env directly if the 'env' import is being stubborn
export const LOG_CHANNEL = process.env.LOG_CHANNEL_ID
  ? parseInt(process.env.LOG_CHANNEL_ID)
  : 1102128542

export const userCommands: readonly BotCommand[] = [
  { command: 'start', description: 'Start the bot' },
  { command: 'setpincode', description: 'Set your pincode' },
  { command: 'pincode', description: 'Get your current pincode' },
  { command: 'products', description: 'List all protein products' },
  { command: 'settings', description: 'View or change your settings' },
  { command: 'tracked', description: 'List all tracked products' },
  { command: 'favourites', description: 'List your favourite products' },
  { command: 'settings', description: 'View or change your settings' },
  { command: 'support', description: 'Get support' },
  { command: 'map', description: 'View interactive map' }
]

export const adminCommands: readonly BotCommand[] = [
  { command: 'broadcast', description: 'Broadcast a message to all users' },
  { command: 'sessions', description: 'List all Amul sessions' },
  { command: 'stats', description: 'Get bot statistics' },
  { command: 'analytics', description: 'Get analytics of products' },
  { command: 'productcount', description: 'Get product count by SKU' }
]

export const TIMEZONE = 'Asia/Kolkata'

export const ACTIONS = {
  settings: {
    trackingStyle: {
      toggle: 'settings:trackingStyle:toggle',
      changeMaxNotifyCount: 'settings:trackingStyle:changeMaxNotifyCount'
    }
  }
}
