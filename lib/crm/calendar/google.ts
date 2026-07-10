/**
 * Google Calendar provider.
 * Uses the Google Calendar REST API v3.
 * Token refresh is handled automatically when the access token is near expiry.
 */

import { prisma } from '@/lib/crm/db'
import { decrypt, encrypt } from '@/lib/crm/crypto'
import type { CalendarProvider, CalendarEvent, ExternalEvent } from './provider'

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

interface GoogleEventResource {
  id?: string
  summary?: string
  description?: string
  location?: string
  start?: { dateTime?: string; timeZone?: string }
  end?: { dateTime?: string; timeZone?: string }
  attendees?: Array<{ email: string }>
}

interface GoogleEventsListResponse {
  items?: GoogleEventResource[]
  nextPageToken?: string
}

interface GoogleTokenRefreshResponse {
  access_token: string
  expires_in?: number
  error?: string
}

export class GoogleCalendarProvider implements CalendarProvider {
  private accessToken: string
  private readonly calendarId: string
  private readonly integrationId: string

  constructor(opts: {
    accessToken: string
    integrationId: string
    calendarId?: string
  }) {
    this.accessToken = opts.accessToken
    this.integrationId = opts.integrationId
    this.calendarId = opts.calendarId ?? 'primary'
  }

  // ─── Token refresh ─────────────────────────────────────────────────────────

  private async refreshAccessToken(): Promise<void> {
    const tokenRow = await prisma.crm_integration_oauth_token.findFirst({
      where: { integrationId: this.integrationId },
      orderBy: { createdAt: 'desc' },
    })
    if (!tokenRow?.refreshToken) {
      throw new Error('[GoogleCalendar] No refresh token available')
    }

    const refreshToken = decrypt(tokenRow.refreshToken)
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    })

    if (!res.ok) {
      throw new Error(`[GoogleCalendar] Token refresh failed: ${await res.text()}`)
    }

    const data = (await res.json()) as GoogleTokenRefreshResponse
    if (data.error) {
      throw new Error(`[GoogleCalendar] Token refresh error: ${data.error}`)
    }

    this.accessToken = data.access_token

    // Persist refreshed token
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

  // ─── Authenticated fetch with auto-refresh ─────────────────────────────────

  private async apiFetch(
    path: string,
    init?: RequestInit,
    retried = false,
  ): Promise<Response> {
    const res = await fetch(`${CALENDAR_API}${path}`, {
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
    const body: GoogleEventResource = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: { dateTime: event.startAt.toISOString(), timeZone: tz },
      end: { dateTime: event.endAt.toISOString(), timeZone: tz },
      attendees: event.attendeeEmails?.map((email) => ({ email })),
    }

    const res = await this.apiFetch(`/calendars/${encodeURIComponent(this.calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      throw new Error(`[GoogleCalendar] createEvent failed: ${await res.text()}`)
    }

    const created = (await res.json()) as GoogleEventResource
    return created.id ?? ''
  }

  async updateEvent(externalId: string, event: CalendarEvent): Promise<void> {
    const tz = event.timeZone ?? 'Asia/Kuala_Lumpur'
    const body: GoogleEventResource = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: { dateTime: event.startAt.toISOString(), timeZone: tz },
      end: { dateTime: event.endAt.toISOString(), timeZone: tz },
      attendees: event.attendeeEmails?.map((email) => ({ email })),
    }

    const res = await this.apiFetch(
      `/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(externalId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    )

    if (!res.ok) {
      throw new Error(`[GoogleCalendar] updateEvent failed: ${await res.text()}`)
    }
  }

  async deleteEvent(externalId: string): Promise<void> {
    const res = await this.apiFetch(
      `/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(externalId)}`,
      { method: 'DELETE' },
    )

    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`[GoogleCalendar] deleteEvent failed: ${await res.text()}`)
    }
  }

  async listEvents(from: Date, to: Date): Promise<ExternalEvent[]> {
    const params = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    })

    const res = await this.apiFetch(
      `/calendars/${encodeURIComponent(this.calendarId)}/events?${params}`,
    )

    if (!res.ok) {
      throw new Error(`[GoogleCalendar] listEvents failed: ${await res.text()}`)
    }

    const data = (await res.json()) as GoogleEventsListResponse
    return (data.items ?? [])
      .filter((item) => item.id && item.start?.dateTime)
      .map((item) => ({
        externalId: item.id!,
        title: item.summary ?? '(No title)',
        startAt: new Date(item.start!.dateTime!),
        endAt: new Date(item.end?.dateTime ?? item.start!.dateTime!),
        description: item.description,
        location: item.location,
      }))
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────────

/**
 * Build a GoogleCalendarProvider from a stored integration record.
 * Decrypts the access token automatically.
 */
export async function buildGoogleCalendarProvider(
  integrationId: string,
  calendarId?: string,
): Promise<GoogleCalendarProvider> {
  const tokenRow = await prisma.crm_integration_oauth_token.findFirst({
    where: { integrationId },
    orderBy: { createdAt: 'desc' },
  })
  if (!tokenRow) {
    throw new Error('[GoogleCalendar] No OAuth token found for integration: ' + integrationId)
  }
  return new GoogleCalendarProvider({
    accessToken: decrypt(tokenRow.accessToken),
    integrationId,
    calendarId,
  })
}
