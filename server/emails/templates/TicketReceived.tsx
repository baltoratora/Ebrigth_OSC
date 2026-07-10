/**
 * Email template: Ticket Received
 *
 * Sent to the submitter immediately after a ticket is created.
 * Uses plain HTML with inline styles — no react-email dependency required.
 *
 * Render with:
 *   import { renderToStaticMarkup } from 'react-dom/server'
 *   import TicketReceived from './TicketReceived'
 *   const html = renderToStaticMarkup(<TicketReceived {...props} />)
 */

import React from 'react'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TicketReceivedProps {
  ticketNumber: string
  platformName: string
  subType: string
  submitterName: string
  /** Structured fields object — rendered as a key/value summary table. */
  fields: Record<string, unknown>
  /** Root URL of the app e.g. https://app.ebright.my */
  appUrl: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\s*/, '')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (value instanceof Date) return value.toLocaleDateString('en-MY')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' && value.trim() === '') return '—'
  // ISO date strings
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value)
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-MY')
  }
  return String(value)
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: '#f4f4f5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    WebkitTextSizeAdjust: '100%' as const,
  },
  outerTable: {
    width: '100%',
    backgroundColor: '#f4f4f5',
    padding: '40px 16px',
  },
  card: {
    maxWidth: '600px',
    margin: '0 auto',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    overflow: 'hidden' as const,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  header: {
    backgroundColor: '#1e293b',
    padding: '32px 40px 24px',
    textAlign: 'center' as const,
  },
  brandName: {
    color: '#ffffff',
    fontSize: '22px',
    fontWeight: '700',
    letterSpacing: '-0.5px',
    margin: 0,
  },
  brandTagline: {
    color: '#94a3b8',
    fontSize: '13px',
    margin: '4px 0 0',
  },
  content: {
    padding: '36px 40px',
  },
  greeting: {
    fontSize: '16px',
    color: '#374151',
    margin: '0 0 20px',
    lineHeight: '1.5',
  },
  badge: {
    display: 'inline-block',
    backgroundColor: '#dcfce7',
    color: '#166534',
    fontSize: '12px',
    fontWeight: '600',
    padding: '4px 12px',
    borderRadius: '100px',
    letterSpacing: '0.3px',
    marginBottom: '24px',
  },
  infoBox: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '20px 24px',
    marginBottom: '28px',
  },
  infoRow: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    padding: '6px 0',
    borderBottom: '1px solid #f1f5f9',
  },
  infoLabel: {
    fontSize: '13px',
    color: '#64748b',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: '13px',
    color: '#1e293b',
    fontWeight: '600',
    textAlign: 'right' as const,
    maxWidth: '60%',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    margin: '0 0 12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  fieldTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    marginBottom: '28px',
  },
  fieldTh: {
    textAlign: 'left' as const,
    fontSize: '12px',
    color: '#94a3b8',
    fontWeight: '600',
    padding: '6px 8px',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  },
  fieldTd: {
    fontSize: '14px',
    color: '#374151',
    padding: '10px 8px',
    borderBottom: '1px solid #f1f5f9',
    verticalAlign: 'top' as const,
    lineHeight: '1.4',
  },
  ctaButton: {
    display: 'inline-block',
    backgroundColor: '#1e293b',
    color: '#ffffff',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '600',
    padding: '12px 28px',
    borderRadius: '8px',
    marginBottom: '28px',
  },
  notice: {
    fontSize: '13px',
    color: '#64748b',
    backgroundColor: '#fefce8',
    border: '1px solid #fde68a',
    borderRadius: '6px',
    padding: '12px 16px',
    lineHeight: '1.5',
    marginBottom: '28px',
  },
  footer: {
    borderTop: '1px solid #e2e8f0',
    padding: '24px 40px',
    textAlign: 'center' as const,
    backgroundColor: '#f8fafc',
  },
  footerText: {
    fontSize: '12px',
    color: '#94a3b8',
    margin: '0 0 4px',
    lineHeight: '1.5',
  },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TicketReceived({
  ticketNumber,
  platformName,
  subType,
  submitterName,
  fields,
  appUrl,
}: TicketReceivedProps) {
  const ticketUrl = `${appUrl}/tickets/${ticketNumber}`

  const filteredFields = Object.entries(fields).filter(
    ([key]) => !['blackWhiteFile', 'generalFile'].includes(key),
  )

  const displayName = submitterName.trim() || 'there'

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Ticket Received — {ticketNumber}</title>
      </head>
      <body style={styles.body}>
        <table style={styles.outerTable} cellPadding={0} cellSpacing={0}>
          <tbody>
            <tr>
              <td>
                <div style={styles.card}>
                  {/* Header */}
                  <div style={styles.header}>
                    <p style={styles.brandName}>Ebright OSC</p>
                    <p style={styles.brandTagline}>Support Portal</p>
                  </div>

                  {/* Body */}
                  <div style={styles.content}>
                    <p style={styles.greeting}>
                      Hi {displayName},
                    </p>
                    <p style={styles.greeting}>
                      Your support ticket has been received and is now in our queue.
                      Our team will review it and get back to you shortly.
                    </p>

                    {/* Status badge */}
                    <span style={styles.badge}>Ticket Received</span>

                    {/* Ticket details box */}
                    <div style={styles.infoBox}>
                      <table width="100%" cellPadding={0} cellSpacing={0}>
                        <tbody>
                          <tr>
                            <td style={styles.infoLabel}>Ticket Number</td>
                            <td style={{ ...styles.infoValue, fontFamily: 'monospace' }}>{ticketNumber}</td>
                          </tr>
                          <tr>
                            <td style={styles.infoLabel}>Platform</td>
                            <td style={styles.infoValue}>{platformName}</td>
                          </tr>
                          <tr>
                            <td style={styles.infoLabel}>Issue Type</td>
                            <td style={styles.infoValue}>
                              {subType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                            </td>
                          </tr>
                          <tr>
                            <td style={styles.infoLabel}>Status</td>
                            <td style={{ ...styles.infoValue, color: '#16a34a' }}>Received</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Field summary */}
                    {filteredFields.length > 0 && (
                      <>
                        <p style={styles.sectionTitle}>Submission Summary</p>
                        <table style={styles.fieldTable} cellPadding={0} cellSpacing={0}>
                          <thead>
                            <tr>
                              <th style={styles.fieldTh}>Field</th>
                              <th style={{ ...styles.fieldTh, textAlign: 'right' as const }}>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredFields.map(([key, value]) => (
                              <tr key={key}>
                                <td style={styles.fieldTd}>{humanizeKey(key)}</td>
                                <td style={{ ...styles.fieldTd, textAlign: 'right' as const }}>
                                  {formatFieldValue(value)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}

                    {/* CTA */}
                    <a href={ticketUrl} style={styles.ctaButton}>
                      View My Ticket
                    </a>

                    {/* Notice */}
                    <div style={styles.notice}>
                      Please keep your ticket number <strong>{ticketNumber}</strong> for reference.
                      You will receive an email update when your ticket status changes.
                    </div>
                  </div>

                  {/* Footer */}
                  <div style={styles.footer}>
                    <p style={styles.footerText}>
                      This email was sent by Ebright OSC Support Portal.
                    </p>
                    <p style={styles.footerText}>
                      If you did not raise this ticket, please contact{' '}
                      <a href="mailto:support@ebright.my" style={{ color: '#64748b' }}>
                        support@ebright.my
                      </a>
                    </p>
                    <p style={{ ...styles.footerText, marginTop: '12px' }}>
                      &copy; {new Date().getFullYear()} Ebright OSC. All rights reserved.
                    </p>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}
