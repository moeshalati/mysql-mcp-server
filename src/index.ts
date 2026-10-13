import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { config } from './config.js';
import { pool } from './db.js';
import { createServer } from './server.js';

function bearerAuth(token: string) {
    const expected = Buffer.from(token);
    return (req: Request, res: Response, next: NextFunction) => {
        const header = req.headers.authorization ?? '';
        const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
        if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
            res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'unauthorized' });
            return;
        }
        next();
    };
}

async function main() {
    if (config.MCP_TRANSPORT === 'stdio') {
        void serveStdio(createServer);
        console.error('mysql-mcp-server running on stdio');
        return;
    }

    const handler = createMcpHandler(createServer);
    const node = toNodeHandler(handler);

    // Host/Origin (DNS-rebinding) validation is enabled automatically for loopback binds.
    const app = createMcpExpressApp({ host: config.MCP_HOST });
    app.get('/health', (_req, res) => void res.json({ status: 'ok' }));
    app.all('/mcp', bearerAuth(config.MCP_AUTH_TOKEN!), (req: Request, res: Response) => void node(req, res, req.body));

    const httpServer = app.listen(config.MCP_PORT, config.MCP_HOST, () => {
        console.error(`mysql-mcp-server listening on http://${config.MCP_HOST}:${config.MCP_PORT}/mcp`);
    });

    const shutdown = (signal: string) => {
        console.error(`${signal} received, shutting down`);
        httpServer.close(() => void pool.end().finally(() => process.exit(0)));
        setTimeout(() => process.exit(1), 5000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
