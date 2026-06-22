import dotenv from 'dotenv'
import { resolve } from 'path'
// Force load env before any module is imported
dotenv.config({ path: resolve(__dirname, '../../.env'), override: true })
