import env from '@/env'
import { CommandContext } from '@/types/context.types'
import { emojis } from '@/utils/emoji.util'
import { MiddlewareFn } from 'telegraf'
import { inlineKeyboard } from 'telegraf/markup'

export const supportCommand: MiddlewareFn<CommandContext> = async (
  ctx,
  next
) => {
  const keyboard = inlineKeyboard([
    [
      {
        text: `Give ${emojis.star} on GitHub`,
        url: `https://github.com/yourusername/amul-notify`
      },
      {
        text: `Contact Developer`,
        url: `https://t.me/yourusername`
      }
    ]
  ])

  await ctx.reply(
    [
      `<b>Support the Bot</b>`,
      `If you find this bot useful, consider giving it a star on GitHub!`,
      `Feel free to contact the developer for any questions or feedback.`,
      `Thank you! 🙏`,
      ''
    ].join('\n'),
    {
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup
    }
  )

  next()
}