import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Cloudflare R2 is S3-compatible. Configured via env vars; until they're set,
// document storage stays dormant (uploads return a clear "not configured"
// error) — same pattern as the Stripe billing keys.
//
// Set R2_ENDPOINT to the endpoint Cloudflare shows for your bucket (use the
// EU jurisdiction endpoint for UK/EU care data), or just set R2_ACCOUNT_ID and
// we build the default endpoint from it.
const { R2_ENDPOINT, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;

function endpoint(): string | undefined {
  if (R2_ENDPOINT) return R2_ENDPOINT;
  if (R2_ACCOUNT_ID) return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return undefined;
}

export function storageConfigured(): boolean {
  return !!(endpoint() && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
}

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: endpoint(),
      credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
      // The AWS SDK now adds request/response integrity checksums by default,
      // which Cloudflare R2 doesn't support and which make uploads fail/hang.
      // Only send a checksum when an operation actually requires one.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
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
