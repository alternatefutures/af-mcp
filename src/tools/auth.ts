import { z } from 'zod';
import { authFetch } from '../client.js';

// ---------------------------------------------------------------------------
// get_user_info
// ---------------------------------------------------------------------------

export const getUserInfoTool = {
  name: 'get_user_info',
  description: 'Get the authenticated user profile and auth methods.',
  parameters: {} as const,
  schema: z.object({}),
  async handler() {
    const [profile, methods] = await Promise.all([
      authFetch<{
        user: {
          id: string;
          email: string;
          displayName: string | null;
          avatarUrl: string | null;
          createdAt: string;
        };
      }>('/account/profile'),
      authFetch<{
        methods: Array<{ type: string; identifier: string }>;
      }>('/account/methods').catch(() => ({ methods: [] })),
    ]);

    const u = profile.user;
    const parts = [
      `User: ${u.displayName || u.email}`,
      `Email: ${u.email}`,
      `ID: ${u.id}`,
      `Created: ${u.createdAt}`,
    ];

    if (methods.methods.length) {
      parts.push(
        `Auth methods: ${methods.methods.map((m) => `${m.type}(${m.identifier})`).join(', ')}`,
      );
    }

    return { content: [{ type: 'text' as const, text: parts.join('\n') }] };
  },
};

// ---------------------------------------------------------------------------
// get_billing_balance
// ---------------------------------------------------------------------------

export const getBillingBalanceTool = {
  name: 'get_billing_balance',
  description:
    'Get the organization credit wallet balance (USD cents). Requires orgId in AF_ORG_ID or as parameter.',
  parameters: {} as const,
  schema: z.object({}),
  async handler() {
    const data = await authFetch<{
      balance: number;
      currency: string;
    }>('/billing/credits/balance');

    const dollars = (data.balance / 100).toFixed(2);
    return { content: [{ type: 'text' as const, text: `Credit balance: $${dollars} (${data.balance} cents)` }] };
  },
};

// ---------------------------------------------------------------------------
// get_usage_history
// ---------------------------------------------------------------------------

export const getUsageHistoryTool = {
  name: 'get_usage_history',
  description: 'Get recent usage/spend history for the organization.',
  parameters: {
    limit: z.number().default(20).describe('Max entries to return (default 20)'),
  } as const,
  schema: z.object({ limit: z.number().default(20) }),
  async handler(args: { limit: number }) {
    const data = await authFetch<{
      usage: Array<{
        id: string;
        type: string;
        description: string;
        amountCents: number;
        createdAt: string;
      }>;
    }>(`/billing/usage/history?limit=${args.limit}`);

    if (!data.usage?.length) {
      return { content: [{ type: 'text' as const, text: 'No usage history found.' }] };
    }

    const lines = data.usage.map(
      (u) =>
        `- ${u.createdAt} | ${u.type} | ${u.description} | $${(u.amountCents / 100).toFixed(2)}`,
    );

    return { content: [{ type: 'text' as const, text: `Usage history (${data.usage.length} entries):\n${lines.join('\n')}` }] };
  },
};

// ---------------------------------------------------------------------------
// get_subscription_status
// ---------------------------------------------------------------------------

export const getSubscriptionStatusTool = {
  name: 'get_subscription_status',
  description: 'Get the current subscription plan and status.',
  parameters: {} as const,
  schema: z.object({}),
  async handler() {
    const data = await authFetch<{
      subscriptions: Array<{
        id: string;
        status: string;
        plan: { name: string; basePricePerSeat: number; billingInterval: string };
        seats: number;
        trialEnd: string | null;
      }>;
    }>('/billing/subscriptions');

    if (!data.subscriptions?.length) {
      return { content: [{ type: 'text' as const, text: 'No active subscription.' }] };
    }

    const lines = data.subscriptions.map((s) => {
      const parts = [
        `Plan: ${s.plan.name} ($${s.plan.basePricePerSeat / 100}/seat/${s.plan.billingInterval})`,
        `Status: ${s.status}`,
        `Seats: ${s.seats}`,
      ];
      if (s.trialEnd) parts.push(`Trial ends: ${s.trialEnd}`);
      return parts.join(' | ');
    });

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
};

// ---------------------------------------------------------------------------
// list_pats
// ---------------------------------------------------------------------------

export const listPatsTool = {
  name: 'list_pats',
  description: 'List Personal Access Tokens for the authenticated user.',
  parameters: {} as const,
  schema: z.object({}),
  async handler() {
    const data = await authFetch<{
      tokens: Array<{
        id: string;
        name: string;
        maskedToken: string;
        lastUsedAt: string | null;
        expiresAt: string | null;
        createdAt: string;
      }>;
    }>('/tokens');

    if (!data.tokens?.length) {
      return { content: [{ type: 'text' as const, text: 'No PATs found.' }] };
    }

    const lines = data.tokens.map(
      (t) =>
        `- ${t.name} (${t.maskedToken}) | created=${t.createdAt} | lastUsed=${t.lastUsedAt || 'never'} | expires=${t.expiresAt || 'never'}`,
    );

    return { content: [{ type: 'text' as const, text: `PATs (${data.tokens.length}):\n${lines.join('\n')}` }] };
  },
};

// ---------------------------------------------------------------------------
// create_pat
// ---------------------------------------------------------------------------

export const createPatTool = {
  name: 'create_pat',
  description:
    'Create a new Personal Access Token. Returns the token value (shown only once).',
  parameters: {
    name: z.string().describe('Token name/label'),
    expiresInDays: z
      .number()
      .optional()
      .describe('Expiry in days from now (omit for no expiry)'),
  } as const,
  schema: z.object({
    name: z.string(),
    expiresInDays: z.number().optional(),
  }),
  async handler(args: { name: string; expiresInDays?: number }) {
    const body: Record<string, unknown> = { name: args.name };
    if (args.expiresInDays) {
      body.expiresAt = new Date(
        Date.now() + args.expiresInDays * 86400000,
      ).toISOString();
    }

    const data = await authFetch<{
      token: { id: string; name: string; token: string; expiresAt: string | null };
    }>('/tokens', { method: 'POST', body });

    return {
      content: [{
        type: 'text' as const,
        text: [
          `PAT created: ${data.token.name}`,
          `Token: ${data.token.token}`,
          `Expires: ${data.token.expiresAt || 'never'}`,
          '',
          'Save this token now — it will not be shown again.',
        ].join('\n'),
      }],
    };
  },
};

// ---------------------------------------------------------------------------
// list_ai_models
// ---------------------------------------------------------------------------

export const listAiModelsTool = {
  name: 'list_ai_models',
  description:
    'List available AI models on the inference proxy (OpenAI-compatible).',
  parameters: {} as const,
  schema: z.object({}),
  async handler() {
    const data = await authFetch<{
      data: Array<{ id: string; object: string; owned_by: string }>;
    }>('/v1/models');

    if (!data.data?.length) {
      return { content: [{ type: 'text' as const, text: 'No AI models available.' }] };
    }

    const byProvider = new Map<string, string[]>();
    for (const m of data.data) {
      const provider = m.owned_by || 'unknown';
      if (!byProvider.has(provider)) byProvider.set(provider, []);
      byProvider.get(provider)!.push(m.id);
    }

    const sections: string[] = [];
    for (const [provider, models] of byProvider) {
      sections.push(`${provider}:\n${models.map((m) => `  - ${m}`).join('\n')}`);
    }

    return { content: [{ type: 'text' as const, text: `AI Models (${data.data.length}):\n${sections.join('\n\n')}` }] };
  },
};
