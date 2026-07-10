/**
 * Outlook / Microsoft Graph calendar provider.
 *
 * OAuth callback is at /api/crm/integrations/outlook/callback.
 * Required env vars:
 *   MICROSOFT_CLIENT_ID
 *   MICROSOFT_CLIENT_SECRET
 *   MICROSOFT_TENANT_ID   (defaults to "common")
 *
 * Token refresh follows the same pattern as the Google provider.
 */

import { prisma } from '@/lib/crm/db'
import { decrypt, encrypt } from '@/lib/crm/crypto'
import type { CalendarProvider, CalendarEvent, ExternalEvent } from './provider'

const GRAPH_API = 'https://graph.microsoft.com/v1.0'
const TOKEN_ENDPOINT_BASE = 'https://login.microsoftonline.com'

interface GraphEventBody {
  subject?: string
  body?: { contentType: string; content: string }
  start?: { dateTime: string; timeZone: string }
  end?: { dateTime: string; timeZone: string }
  location?: { displayName: string }
  attendees?: Array<{ emailAddress: { address: string; name: string }; type: string }>
}

interface GraphEvent {
  id?: string
  subject?: string
  body?: { content?: string }
  start?: { dateTime?: string }
  end?: { dateTime?: string }
  location?: { displayName?: string }
}

interface GraphEventsListResponse {
  value?: GraphEvent[]
  '@odata.nextLink'?: string
}

interface MicrosoftTokenRefreshResponse {
  access_token: string
  expires_in?: number
  error?: string
  error_description?: string
}

export class OutlookCalendarProvider implements CalendarProvider {
  private accessToken: string
  private readonly integrationId: string

  constructor(opts: { accessToken: string; integrationId: string }) {
    this.accessToken = opts.accessToken
    this.integrationId = opts.integrationId
  }

  // ─── Token refresh ─────────────────────────────────────────────────────────

  private async refreshAccessToken(): Promise<void> {
    const tokenRow = await prisma.crm_integration_oauth_token.findFirst({
      where: { integrationId: this.integrationId },
      orderBy: { createdAt: 'desc' },
    })
    if (!tokenRow?.refreshToken) {
      throw new Error('[Outlook] No refresh token available')
    }

    const refreshToken = decrypt(tokenRow.refreshToken)
    const tenantAzure = process.env.MICROSOFT_TENANT_ID ?? 'common'

    const res = await fetch(`${TOKEN_ENDPOINT_BASE}/${tenantAzure}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'Calendars.ReadWrite offline_access',
      }).toString(),
    })

    if (!res.ok) {
      throw new Error(`[Outlook] Token refresh HTTP error: ${res.status}`)
    }

    const data = (await res.json()) as MicrosoftTokenRefreshResponse
    if (data.error) {
      throw new Error(`[Outlook] Token refresh error: ${data.error_description ?? data.error}`)
    }

    this.accessToken = data.access_token

    await prisma.crm_integration_oauth_token.updateMany({
      where: { integrationId: this.integrationId },
      data: {
        accessToken: encrypt(data.access_token),
        expiresAt: data.expires_in
          ? new Date(Date.now() + data.expires_in * 1000)
          : null,
        updatedAt: new Date(),
      },
    })
  }

  // ─── Authenticated fetch ────────────────────────────────────────────────────

  private async apiFetch(
    path: string,
    init?: RequestInit,
    retried = false,
  ): Promise<Response> {
    const res = await fetch(`${GRAPH_API}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (res.status === 401 && !retried) {
      await this.refreshAccessToken()
      return this.apiFetch(path, init, true)
    }

    return res
  }

  // ─── CalendarProvider implementation ──────────────────────────────────────

  async createEvent(event: CalendarEvent): Promise<string> {
    const tz = event.timeZone ?? 'Asia/Kuala_Lumpur'
    const body: GraphEventBody = {
      subject: event.title,
      body: event.description
        ? { contentType: 'text', content: event.description }
        : undefined,
      start: { dateTime: event.startAt.toISOString(), timeZone: tz },
      end: { dateTime: event.endAt.toISOString(), timeZone: tz },
      location: event.location ? { displayName: event.location } : undefined,
      attendees: event.attendeeEmails?.map((email) => ({
        emailAddress: { address: email, name: email },
        type: 'required',
      })),
    }

    const res = await this.apiFetch('/me/events', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      throw new Error(`[Outlook] createEvent failed: ${await res.text()}`)
    }

    const created = (await res.json()) as GraphEvent
    return created.id ?? ''
  }

  async updateEvent(externalId: string, event: CalendarEvent): Promise<void> {
    const tz = event.timeZone ?? 'Asia/Kuala_Lumpur'
    const body: GraphEventBody = {
      subject: event.title,
      body: event.description
        ? { contentType: 'text', content: event.description }
        : undefined,
      start: { dateTime: event.startAt.toISOString(), timeZone: tz },
      end: { dateTime: event.endAt.toISOString(), timeZone: tz },
      location: event.location ? { displayName: event.location } : undefined,
    }

    const res = await this.apiFetch(`/me/events/${encodeURIComponent(externalId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      throw new Error(`[Outlook] updateEvent failed: ${await res.text()}`)
    }
  }

  async deleteEvent(externalId: string): Promise<void> {
    const res = await this.apiFetch(`/me/events/${encodeURIComponent(externalId)}`, {
      method: 'DELETE',
    })

    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`[Outlook] deleteEvent failed: ${await res.text()}`)
    }
  }

  async listEvents(from: Date, to: Date): Promise<ExternalEvent[]> {
    const params = new URLSearchParams({
      startDateTime: from.toISOString(),
      endDateTime: to.toISOString(),
      $top: '250',
      $select: 'id,subject,body,start,end,location',
      $orderby: 'start/dateTime asc',
    })

    const res = await this.apiFetch(`/me/calendarView?${params}`)

    if (!res.ok) {
      throw new Error(`[Outlook] listEvents failed: ${await res.text()}`)
    }

    const data = (await res.json()) as GraphEventsListResponse
    return (data.value ?? [])
      .filter((item) => item.id && item.start?.dateTime)
      .map((item) => ({
        externalId: item.id!,
        title: item.subject ?? '(No title)',
        startAt: new Date(item.start!.dateTime!),
        endAt: new Date(item.end?.dateTime ?? item.start!.dateTime!),
        description: item.body?.content,
        location: item.location?.displayName,
      }))
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────────

export async function buildOutlookCalendarProvider(
  integrationId: string,
): Promise<OutlookCalendarProvider> {
  const tokenRow = await prisma.crm_integration_oauth_token.findFirst({
    where: { integrationId },
    orderBy: { createdAt: 'desc' },
  })
  if (!tokenRow) {
    throw new Error('[Outlook] No OAuth token found for integration: ' + integrationId)
  }
  return new OutlookCalendarProvider({
    accessToken: decrypt(tokenRow.accessToken),
    integrationId,
  })
}
