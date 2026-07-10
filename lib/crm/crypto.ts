/**
 * AES-256-GCM encrypt / decrypt helpers.
 *
 * ENCRYPTION_KEY must be a 64-character hex string (32 bytes).
 * Ciphertext format (all hex, joined with ':'): iv:authTag:ciphertext
 * The whole compound string is then base64url-encoded for safe transport.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // 128-bit IV
const TAG_LENGTH = 16 // 128-bit auth tag

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) {
    throw new Error('[CRM] ENCRYPTION_KEY environment variable is not set')
  }
  // Accept a 64-char hex string → 32 bytes; slice guards against over-length input.
  return Buffer.from(raw, 'hex').subarray(0, 32)
}

/**
 * Encrypt a plaintext string.
 * @returns base64url-encoded string: `iv:authTag:ciphertext` (all hex parts)
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  const compound = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
  return Buffer.from(compound, 'utf8').toString('base64url')
}

/**
 * Decrypt a value produced by `encrypt`.
 * @param encrypted base64url-encoded compound ciphertext
 * @returns original plaintext string
 */
export function decrypt(encrypted: string): string {
  const key = getKey()

  let compound: string
  try {
    compound = Buffer.from(encrypted, 'base64url').toString('utf8')
  } catch {
    throw new Error('[CRM] Failed to base64url-decode the encrypted value')
  }

  const parts = compound.split(':')
  if (parts.length !== 3) {
    throw new Error('[CRM] Malformed encrypted value — expected iv:authTag:ciphertext')
  }

  const [ivHex, authTagHex, ciphertextHex] = parts as [string, string, string]
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')

  if (iv.length !== IV_LENGTH) {
    throw new Error('[CRM] IV length mismatch in encrypted value')
  }
  if (authTag.length !== TAG_LENGTH) {
    throw new Error('[CRM] Auth tag length mismatch in encrypted value')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}

/**
 * Convenience: SHA-256 hash of a string, returned as a hex digest.
 * Used by generateApiKey() in utils.ts but exported here for reuse.
 */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}
