import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })

const app = express()
app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }))
app.use(express.json({ limit: '10mb' }))

app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } })
})

const PORT = process.env.PORT || 3001
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`Backend running on :${PORT}`))
}

export default app
