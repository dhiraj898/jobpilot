import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../src/index'
import { db } from '../src/lib/db'

const email = `smoke_${Date.now()}@example.com`
let token = ''
let appId = ''

beforeAll(async () => {
  await db.user.deleteMany({ where: { email } })
})
afterAll(async () => {
  await db.user.deleteMany({ where: { email } })
  await db.$disconnect()
})

describe('full happy path smoke test', () => {
  it('registers a user', async () => {
    const res = await request(app).post('/auth/register').send({ email, password: 'Smoke1234!' })
    expect(res.status).toBe(201)
    token = res.body.data.token
    expect(token).toBeTruthy()
  })

  it('updates profile', async () => {
    const res = await request(app).put('/profile').set('Authorization', `Bearer ${token}`)
      .send({ name: 'Smoke Test', targetRoles: ['PM'], skills: ['product'],
              aiProvider: 'https://api.anthropic.com/v1', aiModel: 'claude-sonnet-4-6', aiKey: 'sk-smoke-test' })
    expect(res.status).toBe(200)
    expect(res.body.data.hasAiKey).toBe(true)
  })

  it('logs an application', async () => {
    const res = await request(app).post('/applications').set('Authorization', `Bearer ${token}`)
      .send({ company: 'Smoke Corp', role: 'Head of Smoke', source: 'linkedin', url: 'https://example.com' })
    expect(res.status).toBe(201)
    appId = res.body.data.id
  })

  it('updates application status', async () => {
    const res = await request(app).put(`/applications/${appId}`).set('Authorization', `Bearer ${token}`)
      .send({ status: 'interview' })
    expect(res.body.data.status).toBe('interview')
  })

  it('health check still passes', async () => {
    const res = await request(app).get('/health')
    expect(res.body.success).toBe(true)
  })
})
