export interface DriveUploadResult {
  uploaded: boolean;
  fileId?: string;
  skippedReason?: string;
}

export interface DriveUploader {
  uploadPdf(filename: string, pdf: Buffer): Promise<DriveUploadResult>;
}

const NOT_CONFIGURED = 'Drive credentials are not configured';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const READING_FOLDER = 'Reading';

interface AuthorizedUser {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  quotaProjectId?: string;
}

export function createDriveClient(input: {
  driveFolderId?: string;
  driveCredentialsJson?: string;
}): DriveUploader {
  const raw = input.driveCredentialsJson?.trim();
  if (!raw) return skipped(NOT_CONFIGURED);
  const parsed = parseAuthorizedUser(raw);
  if ('error' in parsed) return skipped(parsed.error);

  const credentials = parsed.credentials;
  const presetFolderId = input.driveFolderId?.trim() || undefined;
  let folderId = presetFolderId;
  let access: { token: string; expiresAt: number } | undefined;

  return {
    async uploadPdf(filename, pdf) {
      try {
        const token = await currentAccessToken(credentials, access);
        access = token;
        const parent = folderId ?? await findOrCreateReadingFolder(token.token, credentials.quotaProjectId);
        folderId = parent;
        const fileId = await uploadPdfToDrive({
          token: token.token,
          quotaProjectId: credentials.quotaProjectId,
          folderId: parent,
          filename,
          pdf,
        });
        return { uploaded: true, fileId };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { uploaded: false, skippedReason: message.slice(0, 500) };
      }
    },
  };
}

function skipped(reason: string): DriveUploader {
  return {
    async uploadPdf() {
      return { uploaded: false, skippedReason: reason };
    },
  };
}

function parseAuthorizedUser(raw: string): { credentials: AuthorizedUser } | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { error: 'Drive credentials are not valid JSON' };
  }
  if (!value || typeof value !== 'object') {
    return { error: 'Drive credentials must be a Google authorized_user JSON' };
  }
  const record = value as Record<string, unknown>;
  const clientId = asString(record.client_id);
  const clientSecret = asString(record.client_secret);
  const refreshToken = asString(record.refresh_token);
  if (record.type !== 'authorized_user' || !clientId || !clientSecret || !refreshToken) {
    return {
      error: 'Drive credentials must be a Google authorized_user JSON with client_id, client_secret, and refresh_token',
    };
  }
  return {
    credentials: {
      clientId,
      clientSecret,
      refreshToken,
      quotaProjectId: asString(record.quota_project_id),
    },
  };
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

async function currentAccessToken(
  credentials: AuthorizedUser,
  cached: { token: string; expiresAt: number } | undefined,
): Promise<{ token: string; expiresAt: number }> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached;
  return refreshAccessToken(credentials);
}

async function refreshAccessToken(
  credentials: AuthorizedUser,
): Promise<{ token: string; expiresAt: number }> {
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: credentials.refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw await failure(response, 'Drive token refresh failed');
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error('Drive token refresh returned no access token');
  const seconds = typeof payload.expires_in === 'number' && payload.expires_in > 0
    ? payload.expires_in
    : 300;
  return { token: payload.access_token, expiresAt: Date.now() + seconds * 1000 };
}

async function findOrCreateReadingFolder(token: string, quotaProjectId?: string): Promise<string> {
  const params = new URLSearchParams({
    q: `name = '${READING_FOLDER}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id,parents)',
    pageSize: '10',
    spaces: 'drive',
  });
  const listed = await fetch(`${DRIVE_FILES}?${params}`, {
    headers: authHeaders(token, quotaProjectId),
  });
  if (!listed.ok) throw await failure(listed, 'Drive folder lookup failed');
  const payload = await listed.json() as { files?: Array<{ id?: string; parents?: string[] }> };
  const files = payload.files ?? [];
  const existing = files.find((file) => file.id && file.parents?.includes('root'))
    ?? files.find((file) => file.id);
  if (existing?.id) return existing.id;

  const created = await fetch(`${DRIVE_FILES}?fields=id`, {
    method: 'POST',
    headers: authHeaders(token, quotaProjectId, { 'content-type': 'application/json' }),
    body: JSON.stringify({ name: READING_FOLDER, mimeType: FOLDER_MIME }),
  });
  if (!created.ok) throw await failure(created, 'Drive folder create failed');
  const folder = await created.json() as { id?: string };
  if (!folder.id) throw new Error('Drive folder create returned no file id');
  return folder.id;
}

async function uploadPdfToDrive(input: {
  token: string;
  quotaProjectId?: string;
  folderId: string;
  filename: string;
  pdf: Buffer;
}): Promise<string> {
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
  const response = await fetch(DRIVE_UPLOAD, {
    method: 'POST',
    headers: authHeaders(input.token, input.quotaProjectId, {
      'content-type': `multipart/related; boundary=${boundary}`,
    }),
    body,
  });
  if (!response.ok) throw await failure(response, 'Drive upload failed');
  const payload = await response.json() as { id?: string };
  if (!payload.id) throw new Error('Drive upload returned no file id');
  return payload.id;
}

function authHeaders(
  token: string,
  quotaProjectId: string | undefined,
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    ...extra,
  };
  if (quotaProjectId) headers['x-goog-user-project'] = quotaProjectId;
  return headers;
}

async function failure(response: Response, action: string): Promise<Error> {
  const detail = (await response.text()).slice(0, 300);
  return new Error(`${action} (${response.status}): ${detail}`);
}
