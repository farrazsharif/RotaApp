import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Cloudflare R2 is S3-compatible. Configured via four env vars; until they're
// set, document storage stays dormant (uploads return a clear "not configured"
// error) — same pattern as the Stripe billing keys.
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;

export function storageConfigured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
}

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
    });
  }
  return client;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await getClient().send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType }));
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}

// A short-lived link the browser can use to download the file straight from R2
// (so file bytes never stream back through our server). The content-disposition
// makes the browser save it under the original name.
export async function getDownloadUrl(key: string, fileName: string): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${fileName.replace(/["\\]/g, '')}"`,
  });
  return getSignedUrl(getClient(), cmd, { expiresIn: 300 });
}
