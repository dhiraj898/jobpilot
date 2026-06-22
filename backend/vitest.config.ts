import { defineConfig } from 'vitest/config'
import dotenv from 'dotenv'
import { resolve } from 'path'

// Load .env before vitest starts so env vars are available at module import time
dotenv.config({ path: resolve(__dirname, '../.env'), override: true })

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['dist/**', 'node_modules/**'],
    env: {
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '',
      JWT_SECRET: process.env.JWT_SECRET || '',
      DATABASE_URL: process.env.DATABASE_URL || '',
      PORT: process.env.PORT || '3001',
    }
  }
})
