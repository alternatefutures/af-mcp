/**
 * MCP chat tools — let an MCP-native agent talk in an alt-chat end-to-end
 * encrypted room.
 *
 * These shell out to the `af chat … --json` CLI rather than re-implementing the
 * crypto, so there is exactly ONE audited protocol implementation shared by the
 * browser, the CLI, and (transitively) MCP agents. The `af` CLI
 * (`@alternatefutures/cli`) must be installed and on PATH (override the binary
 * with AF_CLI_BIN). Secrets (room password) are passed to the child via the
 * environment, never argv, so they don't leak in the process table.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { z } from 'zod';

const execFileAsync = promisify(execFile);
const AF_BIN = process.env.AF_CLI_BIN || 'af';

type ChatChildEnv = {
  room: string;
  password: string;
  username?: string;
};

async function runAfChat(
  args: string[],
  env: ChatChildEnv,
): Promise<unknown> {
  try {
    const { stdout } = await execFileAsync(AF_BIN, args, {
      env: {
        ...process.env,
        AF_CHAT_ROOM: env.room,
        AF_CHAT_PASSWORD: env.password,
        ...(env.username ? { AF_CHAT_USERNAME: env.username } : {}),
      },
      maxBuffer: 8 * 1024 * 1024,
      timeout: 30_000,
    });
    // The CLI prints one JSON object on stdout in --json mode.
    const line = stdout.trim().split('\n').filter(Boolean).pop() ?? '{}';
    return JSON.parse(line);
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    if (e.code === 'ENOENT') {
      throw new Error(
        `\`${AF_BIN}\` not found. Install the CLI (npm i -g @alternatefutures/cli) or set AF_CLI_BIN.`,
      );
    }
    throw new Error(e.stderr?.trim() || e.message || 'af chat failed');
  }
}

// ---------------------------------------------------------------------------
// chat_send
// ---------------------------------------------------------------------------

export const chatSendTool = {
  name: 'chat_send',
  description:
    'Send one message to an end-to-end encrypted alt-chat room and confirm it was stored. The relay is blind (sees only ciphertext). No Alternate Clouds login is required.',
  parameters: {
    relay: z
      .string()
      .describe(
        'Relay address: a full URL (https://chat.alternatefutures.ai), a host, or one of your service names. Defaults to the public demo if omitted.',
      )
      .optional(),
    room: z.string().describe('Room name'),
    password: z.string().describe('Room password (shared secret; never sent to the relay)'),
    message: z.string().describe('Message text to send'),
    username: z.string().describe('Display name shown to others').optional(),
  } as const,
  schema: z.object({
    relay: z.string().optional(),
    room: z.string(),
    password: z.string(),
    message: z.string(),
    username: z.string().optional(),
  }),
  async handler(args: {
    relay?: string;
    room: string;
    password: string;
    message: string;
    username?: string;
  }) {
    const cliArgs = ['chat', 'send'];
    if (args.relay) cliArgs.push(args.relay);
    cliArgs.push('--message', args.message, '--json');
    const result = (await runAfChat(cliArgs, args)) as {
      ok?: boolean;
      relay?: string;
      room?: string;
      fingerprint?: string;
      seq?: number;
    };
    return {
      content: [
        {
          type: 'text' as const,
          text: `Sent to #${result.room ?? args.room} on ${result.relay ?? 'relay'} (you: ${result.fingerprint ?? '?'}, seq ${result.seq ?? '?'}).`,
        },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// chat_read
// ---------------------------------------------------------------------------

export const chatReadTool = {
  name: 'chat_read',
  description:
    'Read recent message history from an end-to-end encrypted alt-chat room. Returns decrypted messages (the relay only stores ciphertext). No Alternate Clouds login is required.',
  parameters: {
    relay: z
      .string()
      .describe('Relay URL/host/service name. Defaults to the public demo if omitted.')
      .optional(),
    room: z.string().describe('Room name'),
    password: z.string().describe('Room password (shared secret; never sent to the relay)'),
    limit: z.number().describe('Return only the last N messages (default: all in history)').optional(),
    username: z.string().describe('Display name used while connected').optional(),
  } as const,
  schema: z.object({
    relay: z.string().optional(),
    room: z.string(),
    password: z.string(),
    limit: z.number().optional(),
    username: z.string().optional(),
  }),
  async handler(args: {
    relay?: string;
    room: string;
    password: string;
    limit?: number;
    username?: string;
  }) {
    const cliArgs = ['chat', 'read'];
    if (args.relay) cliArgs.push(args.relay);
    cliArgs.push('--json');
    const result = (await runAfChat(cliArgs, args)) as {
      relay?: string;
      room?: string;
      members?: Array<{ username: string; fingerprint: string }>;
      messages?: Array<{ username: string; text: string; ts: number; mine: boolean }>;
    };

    let msgs = result.messages ?? [];
    if (args.limit && msgs.length > args.limit) msgs = msgs.slice(-args.limit);

    if (!msgs.length) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No messages in #${result.room ?? args.room} on ${result.relay ?? 'relay'}. (A wrong password lands you in a different, empty room.)`,
          },
        ],
      };
    }

    const lines = msgs.map((m) => {
      const t = new Date(m.ts);
      const hh = String(t.getHours()).padStart(2, '0');
      const mm = String(t.getMinutes()).padStart(2, '0');
      return `[${hh}:${mm}] ${m.username}: ${m.text}`;
    });
    const online = result.members?.length
      ? `\nOnline: ${result.members.map((m) => m.username).join(', ')}`
      : '';
    return {
      content: [
        {
          type: 'text' as const,
          text: `#${result.room ?? args.room} on ${result.relay ?? 'relay'} (${msgs.length} message(s)):\n${lines.join('\n')}${online}`,
        },
      ],
    };
  },
};
