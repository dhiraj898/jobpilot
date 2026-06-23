import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import rateLimit from 'express-rate-limit'
import { db } from './lib/db'
import authRouter from './routes/auth'
import profileRouter from './routes/profile'
import applicationsRouter from './routes/applications'
import aiRouter from './routes/ai'

function validateEnv() {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY']
  const missing = required.filter(k => !process.env[k])
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Check your .env file or Vercel project settings.`)
  }
  if (!/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY!)) {
    throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters. Generate with: openssl rand -hex 32')
  }
}
validateEnv()

const app = express()
app.use(helmet())
if (!process.env.ALLOWED_ORIGIN) {
  console.warn('ALLOWED_ORIGIN is not set — production frontend will be blocked by CORS')
}
const allowedOrigins = [
  'http://localhost:5173',
  process.env.ALLOWED_ORIGIN,
].filter(Boolean) as string[]
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json({ limit: '10mb' }))

// Auth endpoints: 10 requests per minute per IP (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please wait a minute before trying again.' },
})

// AI endpoints: 30 requests per 10 minutes per IP (cost control)
const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'AI rate limit reached. Please wait before making more requests.' },
})

app.use('/auth', authLimiter)
app.use('/ai', aiLimiter)

app.use('/auth', authRouter)
app.use('/profile', profileRouter)
app.use('/applications', applicationsRouter)
app.use('/ai', aiRouter)

app.get('/health', async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`
    res.json({ success: true, data: { status: 'ok', db: 'connected' } })
  } catch {
    res.status(503).json({ success: false, data: { status: 'degraded', db: 'unreachable' } })
  }
})

// Global error handler — catches any error thrown from async routes in Express 5
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled error]', err.message, err.stack?.split('\n')[1])
  res.status(500).json({ success: false, error: 'Internal server error' })
})

const PORT = process.env.PORT || 3001
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => console.log(`Backend running on :${PORT}`))
}

export default app
