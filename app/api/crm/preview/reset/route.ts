import { NextResponse } from 'next/server'

/** Clears all preview cookies — goes back to default admin@ebright.my preview user. */
export async function POST() {
  const res = NextResponse.json({ success: true })
  res.cookies.set('crm_preview_user', '', { path: '/', maxAge: 0 })
  res.cookies.set('crm_preview_exit', '', { path: '/', maxAge: 0 })
  return res
}
