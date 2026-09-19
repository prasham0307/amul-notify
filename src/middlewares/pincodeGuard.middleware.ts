import { MyContext } from '@/types/context.types'
import { emojis } from '@/utils/emoji.util'
import { MiddlewareFn } from 'telegraf'

export const pincodeGuard: MiddlewareFn<MyContext> = async (ctx, next) => {
  if (!ctx.user.pincode || !ctx.user.substore) {
    return ctx.reply(
      `${emojis.exclamation} Please set your pincode first using /setpincode command to use this feature.`
    )
  }

  if (!ctx.amul || typeof ctx.amul.getProteinProducts !== 'function') {
    return ctx.reply(
      `⏳ The system is currently starting up and bypassing Cloudflare for your pincode (${ctx.user.pincode}).\n\nPlease wait a few seconds and try again.`
    )
  }

  return next()
}
