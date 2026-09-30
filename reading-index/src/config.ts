import {
  DEFAULT_MAX_BODY,
  DEFAULT_OPTIMIZE_CAP,
  DEFAULT_TINY_BODY,
} from './limits.js';

export interface AppConfig {
  saveToken: string;
  mcpToken: string;
  optimizeToken: string;
  databaseUrl?: string;
  instanceConnectionName?: string;
  dbUser?: string;
  dbPassword?: string;
  dbName?: string;
  gcsBucket?: string;
  dataDir: string;
  driveFolderId?: string;
  googleCredentialsJson?: string;
  modelApiKey?: string;
  modelBaseUrl?: string;
  modelName: string;
  port: number;
  maxBodyChars: number;
  tinyBodyChars: number;
  optimizeCap: number;
}

function blankSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'unused' || trimmed === 'changeme') return undefined;
  return trimmed;
}

function requiredToken(value: string | undefined): string {
  return blankSecret(value) ?? '';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const saveToken = requiredToken(env.SAVE_TOKEN);
  const mcpToken = requiredToken(env.MCP_TOKEN);
  const optimizeToken = requiredToken(env.OPTIMIZE_TOKEN) || saveToken;
  return {
    saveToken,
    mcpToken,
    optimizeToken,
    databaseUrl: blankSecret(env.DATABASE_URL),
    instanceConnectionName: blankSecret(env.INSTANCE_CONNECTION_NAME),
    dbUser: blankSecret(env.DB_USER),
    dbPassword: blankSecret(env.DB_PASSWORD),
    dbName: blankSecret(env.DB_NAME),
    gcsBucket: blankSecret(env.GCS_BUCKET),
    dataDir: env.DATA_DIR?.trim() || './data',
    driveFolderId: blankSecret(env.DRIVE_FOLDER_ID),
    googleCredentialsJson: blankSecret(env.GOOGLE_CREDENTIALS_JSON),
    modelApiKey: blankSecret(env.MODEL_API_KEY),
    modelBaseUrl: blankSecret(env.MODEL_BASE_URL),
    modelName: env.MODEL_NAME?.trim() || 'gpt-4o-mini',
    port: Number(env.PORT || 8080),
    maxBodyChars: Number(env.MAX_BODY_CHARS || DEFAULT_MAX_BODY),
    tinyBodyChars: Number(env.TINY_BODY_CHARS || DEFAULT_TINY_BODY),
    optimizeCap: Number(env.OPTIMIZE_CAP || DEFAULT_OPTIMIZE_CAP),
  };
}

export function assertProductionConfig(config: AppConfig): void {
  if (process.env.NODE_ENV !== 'production') return;
  const missing: string[] = [];
  if (!config.saveToken) missing.push('SAVE_TOKEN');
  if (!config.mcpToken) missing.push('MCP_TOKEN');
  if (!config.optimizeToken) missing.push('OPTIMIZE_TOKEN');
  const hasDatabase = Boolean(
    config.databaseUrl
    || (config.instanceConnectionName && config.dbUser && config.dbPassword && config.dbName),
  );
  if (!hasDatabase) missing.push('DATABASE_URL or INSTANCE_CONNECTION_NAME');
  if (!config.gcsBucket) missing.push('GCS_BUCKET');
  if (missing.length > 0) {
    throw new Error(`production config missing ${missing.join(', ')}`);
  }
}
