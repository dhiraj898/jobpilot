import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../src/index'
import { db } from '../src/lib/db'

const email = `apps_test_${Date.now()}@example.com`
let token = ''
let appId = ''

beforeAll(async () => {
  const res = await request(app).post('/auth/register').send({ email, password: 'Password123!' })
  token = res.body.data.token
})
afterAll(async () => {
  await db.user.deleteMany({ where: { email } })
  await db.$disconnect()
})

it('creates an application', async () => {
  const res = await request(app).post('/applications').set('Authorization', `Bearer ${token}`)
    .send({ company: 'Razorpay', role: 'Senior PM', source: 'linkedin' })
  expect(res.status).toBe(201)
  expect(res.body.data.company).toBe('Razorpay')
  appId = res.body.data.id
})

it('lists applications', async () => {
  const res = await request(app).get('/applications').set('Authorization', `Bearer ${token}`)
  expect(res.status).toBe(200)
  expect(res.body.data.applications.length).toBeGreaterThan(0)
})

it('updates status', async () => {
  const res = await request(app).put(`/applications/${appId}`).set('Authorization', `Bearer ${token}`)
    .send({ status: 'interview' })
  expect(res.body.data.status).toBe('interview')
})

it('deletes application', async () => {
  const res = await request(app).delete(`/applications/${appId}`).set('Authorization', `Bearer ${token}`)
  expect(res.status).toBe(200)
})
