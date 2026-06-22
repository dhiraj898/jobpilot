import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../src/index'
import { db } from '../src/lib/db'

const testEmail = `test_${Date.now()}@example.com`
const testPassword = 'Password123!'
let token = ''

beforeAll(async () => {
  await db.user.deleteMany({ where: { email: testEmail } })
})
afterAll(async () => {
  await db.user.deleteMany({ where: { email: testEmail } })
  await db.$disconnect()
})

describe('POST /auth/register', () => {
  it('creates a user and returns token', async () => {
    const res = await request(app).post('/auth/register').send({ email: testEmail, password: testPassword })
    expect(res.status).toBe(201)
    expect(res.body.data.token).toBeTruthy()
    token = res.body.data.token
  })

  it('rejects duplicate email', async () => {
    const res = await request(app).post('/auth/register').send({ email: testEmail, password: testPassword })
    expect(res.status).toBe(409)
  })
})

describe('POST /auth/login', () => {
  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/auth/login').send({ email: testEmail, password: testPassword })
    expect(res.status).toBe(200)
    expect(res.body.data.token).toBeTruthy()
  })

  it('rejects wrong password', async () => {
    const res = await request(app).post('/auth/login').send({ email: testEmail, password: 'wrongpassword' })
    expect(res.status).toBe(401)
  })
})

describe('GET /auth/me', () => {
  it('returns user with valid token', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.email).toBe(testEmail)
  })

  it('rejects missing token', async () => {
    const res = await request(app).get('/auth/me')
    expect(res.status).toBe(401)
  })
})
