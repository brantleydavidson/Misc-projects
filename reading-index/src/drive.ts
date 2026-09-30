import { GoogleAuth } from 'google-auth-library';

export interface DriveUploadResult {
  uploaded: boolean;
  fileId?: string;
  skippedReason?: string;
}

export interface DriveUploader {
  uploadPdf(filename: string, pdf: Buffer): Promise<DriveUploadResult>;
}

const SKIPPED = 'Drive folder id or Google credentials not configured';

export function createDriveClient(input: {
  driveFolderId?: string;
  googleCredentialsJson?: string;
}): DriveUploader {
  if (!input.driveFolderId || !input.googleCredentialsJson) {
    return {
      async uploadPdf() {
        return { uploaded: false, skippedReason: SKIPPED };
      },
    };
  }
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(input.googleCredentialsJson) as Record<string, unknown>;
  } catch {
    return {
      async uploadPdf() {
        return { uploaded: false, skippedReason: 'GOOGLE_CREDENTIALS_JSON is not valid JSON' };
      },
    };
  }
  const folderId = input.driveFolderId;
  return {
    async uploadPdf(filename, pdf) {
      try {
        const fileId = await uploadPdfToDrive({ folderId, credentials, filename, pdf });
        return { uploaded: true, fileId };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { uploaded: false, skippedReason: message.slice(0, 500) };
      }
    },
  };
}

export async function uploadPdfToDrive(input: {
  folderId: string;
  credentials: Record<string, unknown>;
  filename: string;
  pdf: Buffer;
}): Promise<string> {
  const auth = new GoogleAuth({
    credentials: input.credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const client = await auth.getClient();
  const access = await client.getAccessToken();
  if (!access.token) throw new Error('Google auth returned no access token');
  const boundary = `readingindex${Date.now()}`;
  const metadata = {
    name: input.filename,
    parents: [input.folderId],
    mimeType: 'application/pdf',
  };
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    ),
    input.pdf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access.token}`,
        'content-type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Drive upload failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const payload = await response.json() as { id?: string };
  if (!payload.id) throw new Error('Drive upload returned no file id');
  return payload.id;
}
