import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { db } from '../lib/db'
import { encrypt, decrypt } from '../services/encrypt'

const router = Router()
router.use(requireAuth)

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const profile = await db.profile.findUnique({ where: { userId: req.userId } })
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' })
    const { aiKeyEncrypted, ...safe } = profile
    res.json({ success: true, data: { ...safe, hasAiKey: !!aiKeyEncrypted } })
  } catch (e: unknown) {
    console.error('GET /profile error:', e)
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Server error' })
  }
})

router.put('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, currentTitle, yearsExp, targetRoles, skills, locations,
            resumeText, resumeFileName, aiProvider, aiModel, aiKey } = req.body

    const updateData: Record<string, unknown> = {
      name, currentTitle, yearsExp, targetRoles, skills, locations,
      resumeText, resumeFileName, aiProvider, aiModel
    }
    if (aiKey) updateData.aiKeyEncrypted = encrypt(aiKey)
    Object.keys(updateData).forEach(k => updateData[k] === undefined && delete updateData[k])

    const profile = await db.profile.update({
      where: { userId: req.userId },
      data: updateData as Parameters<typeof db.profile.update>[0]['data']
    })
    const { aiKeyEncrypted, ...safe } = profile
    res.json({ success: true, data: { ...safe, hasAiKey: !!aiKeyEncrypted } })
  } catch (e: unknown) {
    console.error('PUT /profile error:', e)
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Server error' })
  }
})

export async function getDecryptedKey(userId: string): Promise<{ key: string; provider: string; model: string } | null> {
  const profile = await db.profile.findUnique({ where: { userId } })
  if (!profile?.aiKeyEncrypted) return null
  return {
    key: decrypt(profile.aiKeyEncrypted),
    provider: profile.aiProvider,
    model: profile.aiModel
  }
}

export default router
