/**
 * Email template: Ticket Status Changed
 *
 * Handles in_progress, complete, and rejected status transitions.
 * Uses plain HTML with inline styles — no react-email dependency required.
 *
 * Render with:
 *   import { renderToStaticMarkup } from 'react-dom/server'
 *   import TicketStatusChanged from './TicketStatusChanged'
 *   const html = renderToStaticMarkup(<TicketStatusChanged {...props} />)
 */

import React from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type UpdatableStatus = 'in_progress' | 'complete' | 'rejected'

export interface TicketStatusChangedProps {
  ticketNumber: string
  platformName: string
  newStatus: UpdatableStatus
  submitterName: string
  /** Admin's free-text remark (optional for all statuses). */
  adminRemark?: string
  /** Required when newStatus === 'rejected'. */
  rejectionReason?: string
  /** Root URL of the app e.g. https://app.ebright.my */
  appUrl: string
}

// ─── Status config ────────────────────────────────────────────────────────────

interface StatusConfig {
  label: string
  badgeBackground: string
  badgeColor: string
  accentColor: string
  headline: string
  leadText: string
}

const STATUS_CONFIG: Record<UpdatableStatus, StatusConfig> = {
  in_progress: {
    label:           'In Progress',
    badgeBackground: '#dbeafe',
    badgeColor:      '#1e40af',
    accentColor:     '#2563eb',
    headline:        "We're working on your ticket",
    leadText:
      'Good news — your ticket has been picked up by our support team and is currently being worked on. We will update you again once it is resolved.',
  },
  complete: {
    label:           'Completed',
    badgeBackground: '#dcfce7',
    badgeColor:      '#166534',
    accentColor:     '#16a34a',
    headline:        'Your ticket has been resolved',
    leadText:
      'Your support request has been completed. We hope the issue is now resolved. If you experience the same problem again, please do not hesitate to raise a new ticket.',
  },
  rejected: {
    label:           'Rejected',
    badgeBackground: '#fee2e2',
    badgeColor:      '#991b1b',
    accentColor:     '#dc2626',
    headline:        'Your ticket could not be processed',
    leadText:
      'Unfortunately, we were unable to process your support request. Please review the reason provided below and contact us if you believe this decision was made in error.',
  },
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const base = {
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
    margin: '0 0 8px',
    lineHeight: '1.5',
  },
  headline: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1e293b',
    margin: '0 0 16px',
    lineHeight: '1.3',
  },
  leadText: {
    fontSize: '15px',
    color: '#4b5563',
    lineHeight: '1.6',
    margin: '0 0 24px',
  },
  badge: {
    display: 'inline-block',
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
    marginBottom: '24px',
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
  },
  remarkBox: {
    borderRadius: '8px',
    padding: '16px 20px',
    marginBottom: '24px',
    lineHeight: '1.6',
  },
  remarkTitle: {
    fontSize: '13px',
    fontWeight: '700',
    marginBottom: '6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.4px',
  },
  remarkText: {
    fontSize: '14px',
    margin: 0,
    lineHeight: '1.6',
  },
  ctaButton: {
    display: 'inline-block',
    color: '#ffffff',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '600',
    padding: '12px 28px',
    borderRadius: '8px',
    marginBottom: '28px',
  },
  newTicketLink: {
    display: 'inline-block',
    fontSize: '14px',
    textDecoration: 'none',
    fontWeight: '500',
    marginLeft: '12px',
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function AdminRemark({ remark, accentColor }: { remark: string; accentColor: string }) {
  return (
    <div
      style={{
        ...base.remarkBox,
        backgroundColor: '#f0f9ff',
        border: `1px solid ${accentColor}33`,
      }}
    >
      <p style={{ ...base.remarkTitle, color: accentColor }}>Note from our team</p>
      <p style={{ ...base.remarkText, color: '#1e293b' }}>{remark}</p>
    </div>
  )
}

function RejectionReason({ reason }: { reason: string }) {
  return (
    <div
      style={{
        ...base.remarkBox,
        backgroundColor: '#fff1f2',
        border: '1px solid #fecdd3',
      }}
    >
      <p style={{ ...base.remarkTitle, color: '#b91c1c' }}>Reason for Rejection</p>
      <p style={{ ...base.remarkText, color: '#374151' }}>{reason}</p>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TicketStatusChanged({
  ticketNumber,
  platformName,
  newStatus,
  submitterName,
  adminRemark,
  rejectionReason,
  appUrl,
}: TicketStatusChangedProps) {
  const config = STATUS_CONFIG[newStatus]
  const ticketUrl = `${appUrl}/tickets/${ticketNumber}`
  const newTicketUrl = `${appUrl}/tickets/new`
  const displayName = submitterName.trim() || 'there'

  const statusLabel = newStatus
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>
          Ticket {ticketNumber} — {config.label}
        </title>
      </head>
      <body style={base.body}>
        <table style={base.outerTable} cellPadding={0} cellSpacing={0}>
          <tbody>
            <tr>
              <td>
                <div style={base.card}>
                  {/* Header */}
                  <div style={base.header}>
                    <p style={base.brandName}>Ebright OSC</p>
                    <p style={base.brandTagline}>Support Portal</p>
                  </div>

                  {/* Body */}
                  <div style={base.content}>
                    <p style={base.greeting}>Hi {displayName},</p>

                    {/* Status badge */}
                    <span
                      style={{
                        ...base.badge,
                        backgroundColor: config.badgeBackground,
                        color: config.badgeColor,
                      }}
                    >
                      {config.label}
                    </span>

                    <p style={base.headline}>{config.headline}</p>
                    <p style={base.leadText}>{config.leadText}</p>

                    {/* Ticket info */}
                    <div style={base.infoBox}>
                      <table width="100%" cellPadding={0} cellSpacing={0}>
                        <tbody>
                          <tr>
                            <td style={base.infoLabel}>Ticket Number</td>
                            <td style={{ ...base.infoValue, fontFamily: 'monospace' }}>
                              {ticketNumber}
                            </td>
                          </tr>
                          <tr>
                            <td style={base.infoLabel}>Platform</td>
                            <td style={base.infoValue}>{platformName}</td>
                          </tr>
                          <tr>
                            <td style={base.infoLabel}>New Status</td>
                            <td
                              style={{
                                ...base.infoValue,
                                color: config.accentColor,
                                fontWeight: '700',
                              }}
                            >
                              {statusLabel}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Rejection reason (rejection only) */}
                    {newStatus === 'rejected' && rejectionReason && (
                      <RejectionReason reason={rejectionReason} />
                    )}

                    {/* Admin remark (any status) */}
                    {adminRemark && (
                      <AdminRemark remark={adminRemark} accentColor={config.accentColor} />
                    )}

                    {/* CTAs */}
                    <div>
                      <a
                        href={ticketUrl}
                        style={{
                          ...base.ctaButton,
                          backgroundColor: config.accentColor,
                        }}
                      >
                        View Ticket
                      </a>

                      {/* For rejected tickets, prompt the user to raise a new one */}
                      {newStatus === 'rejected' && (
                        <a
                          href={newTicketUrl}
                          style={{
                            ...base.newTicketLink,
                            color: config.accentColor,
                          }}
                        >
                          Raise a New Ticket
                        </a>
                      )}
                    </div>

                    {/* Completion note */}
                    {newStatus === 'complete' && (
                      <p
                        style={{
                          fontSize: '13px',
                          color: '#64748b',
                          backgroundColor: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          borderRadius: '6px',
                          padding: '12px 16px',
                          lineHeight: '1.5',
                          marginTop: '4px',
                        }}
                      >
                        Your ticket and its details will remain visible in the portal for{' '}
                        <strong>7 days</strong> from today, after which it will be archived.
                      </p>
                    )}
                  </div>

                  {/* Footer */}
                  <div style={base.footer}>
                    <p style={base.footerText}>
                      This email was sent by Ebright OSC Support Portal.
                    </p>
                    <p style={base.footerText}>
                      If you have questions, contact{' '}
                      <a href="mailto:support@ebright.my" style={{ color: '#64748b' }}>
                        support@ebright.my
                      </a>
                    </p>
                    <p style={{ ...base.footerText, marginTop: '12px' }}>
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
