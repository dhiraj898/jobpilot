import { PrismaClient } from '@prisma/client'

// In serverless environments (Vercel) we intentionally do NOT cache the client
// across invocations. Connection pooling is handled by Supabase pgbouncer —
// DATABASE_URL must point to port 6543 with ?pgbouncer=true&connection_limit=1.
export const db = new PrismaClient()
