import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { config } from './config.js';
import { runReadOnlyQuery } from './db.js';

function text(t: string, isError = false) {
    return { content: [{ type: 'text' as const, text: t }], ...(isError ? { isError: true } : {}) };
}

export function createServer(): McpServer {
    const server = new McpServer({ name: 'mysql-mcp-server', version: '1.0.0' });

    server.registerTool(
        'query',
        {
            description:
                `Run a read-only SQL query (SELECT/WITH/SHOW/DESCRIBE/EXPLAIN) against the MySQL database. ` +
                `Returns at most ${config.QUERY_MAX_ROWS} rows. Use SHOW TABLES / DESCRIBE <table> to explore the schema.`,
            inputSchema: { sql: z.string().min(1).max(10_000).describe('A single read-only SQL statement') },
        },
        async ({ sql }) => {
            const started = Date.now();
            try {
                const { rows, truncated } = await runReadOnlyQuery(sql);
                console.error(`[query] ok rows=${rows.length} ms=${Date.now() - started} sql=${sql.replace(/\s+/g, ' ').slice(0, 200)}`);

                let body = JSON.stringify(rows);
                let note = truncated ? `\n(Result truncated to ${config.QUERY_MAX_ROWS} rows. Add a LIMIT/WHERE.)` : '';
                if (body.length > config.MAX_RESPONSE_CHARS) {
                    // Drop whole rows rather than cutting the JSON mid-token.
                    let n = rows.length;
                    while (n > 0 && JSON.stringify(rows.slice(0, n)).length > config.MAX_RESPONSE_CHARS) n = Math.floor(n / 2);
                    body = JSON.stringify(rows.slice(0, n));
                    note = `\n(Output limited to ${n} of ${rows.length} rows by size. Select fewer columns or rows.)`;
                }
                return text(body + note);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[query] error ms=${Date.now() - started} ${msg}`);
                return text(`Query failed: ${msg}`, true);
            }
        },
    );

    return server;
}
