/**
 * Factory that instantiates the correct WhatsAppProvider for a given branch
 * by reading and decrypting its settings from the database.
 */

import { decrypt } from '@/lib/crm/crypto'
import { prisma } from '@/lib/crm/db'
import { MetaWhatsAppProvider } from './meta'
import { TwilioWhatsAppProvider } from './twilio'
import type { WhatsAppProvider } from './provider'

// ---------------------------------------------------------------------------
// Credential shapes stored (encrypted) in crm_whatsapp_settings.credentials
// ---------------------------------------------------------------------------

interface MetaCredentials {
  phoneNumberId: string
  accessToken: string
  appSecret: string
}

interface TwilioCredentials {
  accountSid: string
  authToken: string
  fromNumber: string
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isMetaCredentials(obj: unknown): obj is MetaCredentials {
  if (typeof obj !== 'object' || obj === null) return false
  const c = obj as Record<string, unknown>
  return (
    typeof c['phoneNumberId'] === 'string' &&
    typeof c['accessToken'] === 'string' &&
    typeof c['appSecret'] === 'string'
  )
}

function isTwilioCredentials(obj: unknown): obj is TwilioCredentials {
  if (typeof obj !== 'object' || obj === null) return false
  const c = obj as Record<string, unknown>
  return (
    typeof c['accountSid'] === 'string' &&
    typeof c['authToken'] === 'string' &&
    typeof c['fromNumber'] === 'string'
  )
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Returns a configured WhatsAppProvider for the given branch, or null if:
 * - No whatsapp settings exist for the branch
 * - The credentials field is empty / missing
 * - The provider type is unrecognised
 *
 * Throws if decryption or JSON parsing fails (corrupt data).
 */
export async function getWhatsAppProvider(
  branchId: string,
): Promise<WhatsAppProvider | null> {
  const settings = await prisma.crm_whatsapp_settings.findUnique({
    where: { branchId },
  })

  if (!settings || !settings.credentials) return null

  let parsed: unknown
  try {
    const plaintext = decrypt(settings.credentials)
    parsed = JSON.parse(plaintext) as unknown
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `[WhatsApp Factory] Failed to decrypt credentials for branch ${branchId}: ${message}`,
    )
  }

  switch (settings.provider) {
    case 'META_CLOUD': {
      if (!isMetaCredentials(parsed)) {
        throw new Error(
          `[WhatsApp Factory] Invalid Meta credentials shape for branch ${branchId}`,
        )
      }
      return new MetaWhatsAppProvider({
        phoneNumberId: parsed.phoneNumberId,
        accessToken: parsed.accessToken,
        appSecret: parsed.appSecret,
      })
    }

    case 'TWILIO': {
      if (!isTwilioCredentials(parsed)) {
        throw new Error(
          `[WhatsApp Factory] Invalid Twilio credentials shape for branch ${branchId}`,
        )
      }
      return new TwilioWhatsAppProvider({
        accountSid: parsed.accountSid,
        authToken: parsed.authToken,
        fromNumber: parsed.fromNumber,
      })
    }

    default:
      return null
  }
}
