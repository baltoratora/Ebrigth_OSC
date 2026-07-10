/**
 * Message Sender Worker — crm.message_sender BullMQ worker.
 *
 * Picks up jobs with { messageId, tenantId, branchId }, loads the crm_message
 * record, and delivers via the appropriate channel (WhatsApp or Email).
 * Updates message status to 'sent' or 'failed'.
 */

import { Worker } from 'bullmq'
import { redisConnection } from '@/lib/crm/queue'
import type { MessageSenderJobData } from '@/lib/crm/queue'
import { prisma } from '@/lib/crm/db'
import { getWhatsAppProvider } from '@/lib/crm/whatsapp/factory'
import { sendEmail } from '@/lib/crm/email'

export const messageSenderWorker = new Worker<MessageSenderJobData>(
  'crm.message_sender',
  async (job) => {
    const { messageId, tenantId, branchId } = job.data

    // Load message record
    const message = await prisma.crm_message.findUnique({
      where: { id: messageId },
      include: {
        contact: { select: { phone: true, email: true } },
      },
    })

    if (!message) {
      throw new Error(`Message ${messageId} not found`)
    }

    if (message.status === 'sent') {
      console.warn(`[messageSenderWorker] Message ${messageId} already sent — skipping`)
      return
    }

    try {
      if (message.channel === 'WHATSAPP') {
        const phone = message.contact.phone
        if (!phone) {
          throw new Error(`Contact for message ${messageId} has no phone number`)
        }

        const provider = await getWhatsAppProvider(branchId)
        if (!provider) {
          throw new Error(`No WhatsApp provider configured for branch ${branchId}`)
        }

        const result = await provider.sendText(phone, message.body)
        const providerMessageId = (result as { messageId?: string } | undefined)?.messageId ?? null

        await prisma.crm_message.update({
          where: { id: messageId },
          data: {
            status: 'sent',
            providerMessageId,
            errorMessage: null,
          },
        })

        console.log(`[messageSenderWorker] WhatsApp message ${messageId} sent to ${phone}`)
      } else if (message.channel === 'EMAIL') {
        const to = message.contact.email
        if (!to) {
          throw new Error(`Contact for message ${messageId} has no email address`)
        }

        const { id: emailId } = await sendEmail({
          to,
          subject: message.subject ?? 'Message from Ebright',
          html: message.body,
        })

        await prisma.crm_message.update({
          where: { id: messageId },
          data: {
            status: 'sent',
            providerMessageId: emailId,
            errorMessage: null,
          },
        })

        console.log(`[messageSenderWorker] Email message ${messageId} sent to ${to} (resend: ${emailId})`)
      } else if (message.channel === 'SMS') {
        // Delegate to shared ebright.events queue for cross-module SMS
        const { Queue } = await import('bullmq')
        const ebrightEvents = new Queue('ebright.events', { connection: redisConnection })
        await ebrightEvents.add('sms_request', {
          type: 'SMS_REQUEST',
          to: message.contact.phone,
          body: message.body,
          tenantId,
        })

        await prisma.crm_message.update({
          where: { id: messageId },
          data: { status: 'sent' },
        })

        console.log(`[messageSenderWorker] SMS message ${messageId} enqueued for ${message.contact.phone}`)
      } else {
        throw new Error(`Unknown channel: ${String(message.channel)}`)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)

      await prisma.crm_message.update({
        where: { id: messageId },
        data: {
          status: 'failed',
          errorMessage,
        },
      })

      throw err // Re-throw so BullMQ retries
    }
  },
  {
    connection: redisConnection,
    concurrency: 20,
    // Retries handled by queue default options (3x exponential)
  },
)

messageSenderWorker.on('completed', (job) => {
  console.log(`[messageSenderWorker] Job ${job.id} completed`)
})

messageSenderWorker.on('failed', (job, err) => {
  console.error(`[messageSenderWorker] Job ${job?.id} failed:`, err.message)
})

export default messageSenderWorker
