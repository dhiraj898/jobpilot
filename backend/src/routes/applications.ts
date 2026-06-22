import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { db } from '../lib/db'

const router = Router()
router.use(requireAuth)

router.get('/', async (req: AuthRequest, res: Response) => {
  const { status, source, limit = '20', offset = '0' } = req.query
  const where = {
    userId: req.userId!,
    ...(status ? { status: status as string } : {}),
    ...(source ? { source: source as string } : {}),
  }
  const [applications, total] = await db.$transaction([
    db.application.findMany({
      where, orderBy: { appliedAt: 'desc' },
      take: parseInt(limit as string), skip: parseInt(offset as string)
    }),
    db.application.count({ where })
  ])
  res.json({ success: true, data: { applications, total } })
})

router.post('/', async (req: AuthRequest, res: Response) => {
  const { company, role, source, url, status, notes, tailoredResume } = req.body
  if (!company || !role) {
    return res.status(400).json({ success: false, error: 'company and role are required' })
  }
  const app = await db.application.create({
    data: {
      userId: req.userId!, company, role, source: source || 'manual',
      url: url || '', status: status || 'applied',
      notes: notes || '', tailoredResume: tailoredResume || ''
    }
  })
  res.status(201).json({ success: true, data: app })
})

router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { status, notes, url } = req.body
  const id = String(req.params.id)
  const existing = await db.application.findFirst({ where: { id, userId: req.userId } })
  if (!existing) return res.status(404).json({ success: false, error: 'Not found' })
  const updated = await db.application.update({
    where: { id },
    data: { ...(status !== undefined ? { status: String(status) } : {}), ...(notes !== undefined ? { notes: String(notes) } : {}), ...(url !== undefined ? { url: String(url) } : {}) }
  })
  res.json({ success: true, data: updated })
})

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id)
  const existing = await db.application.findFirst({ where: { id, userId: req.userId } })
  if (!existing) return res.status(404).json({ success: false, error: 'Not found' })
  await db.application.delete({ where: { id } })
  res.json({ success: true, data: null })
})

export default router
