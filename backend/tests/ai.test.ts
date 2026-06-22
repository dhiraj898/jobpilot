import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../src/index'
import { db } from '../src/lib/db'

vi.mock('../src/services/aiProxy', () => ({
  callAI: vi.fn().mockResolvedValue('{"score":80,"matchedKeywords":["PM"],"missingKeywords":[],"summary":"Good match"}')
}))

const email = `ai_test_${Date.now()}@example.com`
let token = ''

beforeAll(async () => {
  const res = await request(app).post('/auth/register').send({ email, password: 'Password123!' })
  token = res.body.data.token
  await request(app).put('/profile').set('Authorization', `Bearer ${token}`)
    .send({ aiProvider: 'https://api.anthropic.com/v1', aiModel: 'claude-sonnet-4-6', aiKey: 'sk-test' })
})
afterAll(async () => {
  await db.user.deleteMany({ where: { email } })
  await db.$disconnect()
})

it('returns 400 when missing fields on tailor-resume', async () => {
  const res = await request(app).post('/ai/tailor-resume').set('Authorization', `Bearer ${token}`).send({})
  expect(res.status).toBe(400)
})

it('returns match score', async () => {
  const res = await request(app).post('/ai/match-score').set('Authorization', `Bearer ${token}`)
    .send({ resumeText: 'PM with 5 years exp', jobDescription: 'Looking for a PM' })
  expect(res.status).toBe(200)
  expect(res.body.data.score).toBe(80)
})
