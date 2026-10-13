import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
    DB_HOST: z.string().default('localhost'),
    DB_PORT: z.coerce.number().int().positive().default(3306),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_NAME: z.string().min(1),
    MCP_TRANSPORT: z.enum(['http', 'stdio']).default('http'),
    MCP_HOST: z.string().default('127.0.0.1'),
    MCP_PORT: z.coerce.number().int().positive().default(3000),
    MCP_AUTH_TOKEN: z.string().optional(),
    QUERY_MAX_ROWS: z.coerce.number().int().positive().default(200),
    QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    MAX_RESPONSE_CHARS: z.coerce.number().int().positive().default(50_000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`Invalid configuration:\n${issues}\nSee .env.example`);
    process.exit(1);
}

export const config = parsed.data;

if (config.MCP_TRANSPORT === 'http' && (!config.MCP_AUTH_TOKEN || config.MCP_AUTH_TOKEN.length < 16)) {
    console.error('MCP_AUTH_TOKEN is required (min 16 chars) for the http transport. Generate one: openssl rand -hex 32');
    process.exit(1);
}
