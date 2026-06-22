import { describe, it, expect } from 'vitest'
import dotenv from 'dotenv'
dotenv.config({ path: '../../.env' })
import { encrypt, decrypt } from '../src/services/encrypt'

describe('encrypt/decrypt', () => {
  it('roundtrips a string', () => {
    const original = 'sk-ant-my-secret-api-key-12345'
    const enc = encrypt(original)
    expect(enc).not.toBe(original)
    expect(decrypt(enc)).toBe(original)
  })

  it('produces different ciphertext each time (random IV)', () => {
    const key = 'same-key'
    expect(encrypt(key)).not.toBe(encrypt(key))
  })
})
