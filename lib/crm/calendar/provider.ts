/**
 * Calendar provider interface.
 * Implemented by GoogleCalendarProvider and OutlookCalendarProvider.
 */

export interface CalendarEvent {
  title: string
  description?: string
  startAt: Date
  endAt: Date
  attendeeEmails?: string[]
  location?: string
  timeZone?: string
}

export interface ExternalEvent {
  externalId: string
  title: string
  startAt: Date
  endAt: Date
  description?: string
  location?: string
}

export interface CalendarProvider {
  /** Create a new calendar event. Returns the external event ID. */
  createEvent(event: CalendarEvent): Promise<string>

  /** Update an existing calendar event by its external ID. */
  updateEvent(externalId: string, event: CalendarEvent): Promise<void>

  /** Delete a calendar event by its external ID. */
  deleteEvent(externalId: string): Promise<void>

  /** List events in a date range. */
  listEvents(from: Date, to: Date): Promise<ExternalEvent[]>
}
