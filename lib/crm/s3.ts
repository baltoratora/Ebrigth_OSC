/**
 * S3 helpers for ticket attachments.
 * Uses AWS SDK v3 with S3-compatible endpoints (supports IPServerOne / MinIO / R2).
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const BUCKET = process.env.S3_BUCKET ?? 'ebright-tickets'
const MAX_SIZE_BYTES = 25 * 1024 * 1024 // 25 MB

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  // Some browsers/OSes report .jpg as the non-standard image/jpg — accept it
  // so those uploads don't get rejected at validation.
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
])

function getClient(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION ?? 'ap-southeast-1',
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    },
    forcePathStyle: !!process.env.S3_ENDPOINT, // needed for MinIO / non-AWS
  })
}

/**
 * Generate a presigned PUT URL for direct browser-to-S3 upload.
 * Returns { url, s3Key } — client uploads to `url`, then registers `s3Key` with the API.
 */
export async function getPresignedUploadUrl(opts: {
  tenantId: string
  ticketId: string
  fileName: string
  mimeType: string
  sizeBytes?: number
}): Promise<{ url: string; s3Key: string }> {
  if (!ALLOWED_MIME.has(opts.mimeType)) {
    throw new Error(`File type not allowed: ${opts.mimeType}`)
  }
  if (opts.sizeBytes && opts.sizeBytes > MAX_SIZE_BYTES) {
    throw new Error(`File exceeds 25 MB limit`)
  }

  const ext = opts.fileName.split('.').pop() ?? 'bin'
  const s3Key = `tickets/${opts.tenantId}/${opts.ticketId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const client = getClient()
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ContentType: opts.mimeType,
    }),
    { expiresIn: 300 }, // 5 minutes
  )

  return { url, s3Key }
}

/**
 * Server-side upload. The browser sends the file to our own API route, which
 * then streams it to S3 with the SDK — so the upload never makes a cross-origin
 * browser→S3 request and is immune to bucket-CORS misconfiguration (the cause
 * of the "Failed to fetch" errors on the old presigned direct-PUT path).
 */
export async function uploadToS3(opts: {
  tenantId: string
  ticketId: string
  fileName: string
  mimeType: string
  body: Buffer
}): Promise<{ s3Key: string }> {
  if (!ALLOWED_MIME.has(opts.mimeType)) {
    throw new Error(`File type not allowed: ${opts.mimeType}`)
  }
  if (opts.body.byteLength > MAX_SIZE_BYTES) {
    throw new Error('File exceeds 25 MB limit')
  }
  const ext = opts.fileName.split('.').pop() ?? 'bin'
  const s3Key = `tickets/${opts.tenantId}/${opts.ticketId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const client = getClient()
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: opts.body,
      ContentType: opts.mimeType,
    }),
  )
  return { s3Key }
}

/**
 * Generate a presigned GET URL to serve an attachment to an authenticated user.
 * Expires in 1 hour.
 */
export async function getPresignedDownloadUrl(s3Key: string): Promise<string> {
  const client = getClient()
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }),
    { expiresIn: 3600 },
  )
}

/**
 * Permanently delete an object from S3.
 */
export async function deleteS3Object(s3Key: string): Promise<void> {
  const client = getClient()
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key }))
}

export { MAX_SIZE_BYTES, ALLOWED_MIME }
