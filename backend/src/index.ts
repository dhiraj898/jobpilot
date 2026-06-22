import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })

import authRouter from './routes/auth'
import profileRouter from './routes/profile'
import applicationsRouter from './routes/applications'
import aiRouter from './routes/ai'

const app = express()
app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }))
app.use(express.json({ limit: '10mb' }))

// Temporary request logger for debugging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

app.use('/auth', authRouter)
app.use('/profile', profileRouter)
app.use('/applications', applicationsRouter)
app.use('/ai', aiRouter)

app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } })
})

const PORT = process.env.PORT || 3001
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`Backend running on :${PORT}`))
}

export default app
