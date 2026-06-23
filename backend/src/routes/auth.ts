import { Router, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Prisma } from '@prisma/client'
import { db } from '../lib/db'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password || password.length < 8) {
      return res.status(400).json({ success: false, error: 'Email and password (min 8 chars) required' })
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address' })
    }
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) return res.status(409).json({ success: false, error: 'Email already registered' })
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await db.user.create({
      data: { email, passwordHash, profile: { create: {} } }
    })
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '30d' })
    res.status(201).json({ success: true, data: { token, userId: user.id, email: user.email } })
  } catch (e) {
    console.error('[register error]', e)
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Email already registered' })
    }
    res.status(500).json({ success: false, error: 'Registration failed. Please try again.' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' })
    }
    const user = await db.user.findUnique({ where: { email } })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' })
    }
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '30d' })
    res.json({ success: true, data: { token, userId: user.id, email: user.email } })
  } catch (e) {
    res.status(500).json({ success: false, error: 'Login failed. Please try again.' })
  }
})

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, createdAt: true }
    })
    if (!user) return res.status(404).json({ success: false, error: 'User not found' })
    res.json({ success: true, data: user })
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to fetch user. Please try again.' })
  }
})

export default router
