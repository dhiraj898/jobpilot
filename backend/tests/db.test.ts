import { describe, it, expect, afterAll } from 'vitest'
import { db } from '../src/lib/db'

describe('database', () => {
  it('connects successfully', async () => {
    const result = await db.$queryRaw`SELECT 1+1 AS result`
    expect(result).toBeDefined()
  })

  afterAll(async () => { await db.$disconnect() })
})
