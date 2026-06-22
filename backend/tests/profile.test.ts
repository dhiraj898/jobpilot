import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../src/index'
import { db } from '../src/lib/db'

const email = `profile_test_${Date.now()}@example.com`
let token = ''

beforeAll(async () => {
  const res = await request(app).post('/auth/register').send({ email, password: 'Password123!' })
  token = res.body.data.token
})
afterAll(async () => {
  await db.user.deleteMany({ where: { email } })
  await db.$disconnect()
})

describe('GET /profile', () => {
  it('returns profile for authenticated user', async () => {
    const res = await request(app).get('/profile').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.hasAiKey).toBe(false)
  })
})

describe('PUT /profile', () => {
  it('updates profile fields', async () => {
    const res = await request(app).put('/profile').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rahul Sharma', currentTitle: 'Product Manager', targetRoles: ['Senior PM'] })
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Rahul Sharma')
  })

  it('encrypts API key and confirms hasAiKey=true', async () => {
    const res = await request(app).put('/profile').set('Authorization', `Bearer ${token}`)
      .send({ aiProvider: 'https://api.anthropic.com/v1', aiModel: 'claude-sonnet-4-6', aiKey: 'sk-ant-test-key' })
    expect(res.status).toBe(200)
    expect(res.body.data.hasAiKey).toBe(true)
    expect(res.body.data.aiKeyEncrypted).toBeUndefined()
  })
})
