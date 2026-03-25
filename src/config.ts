export const CONFIG = {
  cloudApiUrl:
    process.env.AF_API_URL || 'https://api.alternatefutures.ai',
  authApiUrl:
    process.env.AF_AUTH_URL || 'https://auth.alternatefutures.ai',
  token: process.env.AF_PAT || '',
  organizationId: process.env.AF_ORG_ID || '',
} as const;

export function requireToken(): string {
  if (!CONFIG.token) {
    throw new Error(
      'AF_PAT environment variable required. Create a PAT at https://app.alternatefutures.ai → Tokens.',
    );
  }
  return CONFIG.token;
}
