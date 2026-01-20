import chalk from 'chalk'
import { existsSync, writeFileSync } from 'fs'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['local', 'production', 'staging', 'test']).default('local'),
  // Server Configuration
  PORT: z.coerce.number().default(5999),
  MONGO_URI: z.string().min(1, { message: 'MONGO_URI is required' }),
  // Bot Configuration
  BOT_TOKEN: z.string().min(1, { message: 'BOT_TOKEN is required' }),
  BOT_WEBHOOK_URL: z.string().optional(),

  // Redis - support both URL-based connection and individual parameters
  REDIS_URL: z.string().optional(),
  REDIS_PRIVATE_URL: z.string().optional(),
  REDIS_PUBLIC_URL: z.string().optional(), // Add this
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().optional(),
  REDIS_DATABASE_INDEX: z.coerce.number().default(0),

  // Railway Redis variables
  REDISHOST: z.string().optional(),
  REDISPORT: z.coerce.number().optional(),
  REDISUSER: z.string().optional(),
  REDISPASSWORD: z.string().optional(),

  // Tracker
  TRACKER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((val) => val === 'true'),
  LOG_CHANNEL_ID: z.string().optional()
})

export type Env = z.infer<typeof envSchema>

if (!existsSync('.env.example')) {
  // if .env.example do not exist, create it
  console.log(
    chalk.yellow(
      'Creating .env.example file. Please update it with your environment variables.'
    )
  )
  const shape = envSchema.shape

  const lines: string[] = []

  let currentSectionTitle = ''
  for (const [key, value] of Object.entries(shape)) {
    const title = key.split('_')[0].toUpperCase()
    if (currentSectionTitle !== title) {
      lines.push(`\n# ${title}`)
      currentSectionTitle = title
    }

    const defaultValue =
      'defaultValue' in value._def ? value._def.defaultValue().toString() : ''

    lines.push(`${key}=${defaultValue}`)
  }

  const content = lines.join('\n')
  writeFileSync('.env.example', content, {
    encoding: 'utf-8'
  })
}

const result = envSchema.safeParse(process.env)
if (!result.success) {
  console.error(
    chalk.red('Invalid environment variables Please check your .env file:')
  )
  console.error(
    chalk.red(
      result.error.errors
        .flatMap(
          (e) => `${chalk.redBright(`[${e.path?.join('][')}]`)}: ${e.message}`
        )
        .join('\n')
    )
  )

  process.exit(1)
}

const env = result.data
export default env
