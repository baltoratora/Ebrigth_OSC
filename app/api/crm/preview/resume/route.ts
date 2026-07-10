import { NextResponse } from 'next/server'

/**
 * Clears all preview cookies and drops the user back into the preview dashboard
 * as the default admin. Useful after an accidental Sign Out.
 */
function buildResponse() {
  const res = NextResponse.redirect(
    new URL('/crm/dashboard', process.env.NEXTAUTH_URL ?? 'http://localhost:3000'),
  )
  res.cookies.set('crm_preview_exit', '', { path: '/', maxAge: 0 })
  res.cookies.set('crm_preview_user', '', { path: '/', maxAge: 0 })
  return res
}

export async function GET() {
  return buildResponse()
}

export async function POST() {
  return buildResponse()
}
