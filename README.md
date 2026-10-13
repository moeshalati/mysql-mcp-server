# mysql-mcp-server

A small, security-minded [Model Context Protocol](https://modelcontextprotocol.io) server that lets an
AI assistant (VS Code Copilot, Claude, etc.) run **read-only** SQL queries against a MySQL database.
Designed for **local use**: loopback-only by default, bearer-token auth, and read-only enforcement at
the database level.

## Features

- **`query` tool** – runs a single `SELECT` / `WITH` / `SHOW` / `DESCRIBE` / `EXPLAIN` statement
- **Defense in depth** for read-only access:
  1. SELECT-only MySQL user (you create it, see below) — the real guarantee
  2. Every query runs inside `START TRANSACTION READ ONLY`, then rolls back
  3. SQL guard rejects writes, stacked statements, `INTO OUTFILE`, `FOR UPDATE`, `SLEEP`, `LOAD_FILE`, …
- **Limits**: row cap, server-side `max_execution_time`, response size cap (drops whole rows, never emits broken JSON)
- **HTTP hardening**: binds to `127.0.0.1`, Host/Origin (DNS-rebinding) validation, constant-time bearer-token check
- **Transports**: Streamable HTTP (default) or stdio
- Config via environment variables, validated at startup; graceful shutdown; query audit log on stderr

## Quick start

```bash
git clone https://github.com/moeshalati/mysql-mcp-server && cd mysql-mcp-server
npm install
cp .env.example .env        # then edit .env
npm run build && npm start
```

Generate an auth token for `MCP_AUTH_TOKEN`:

```bash
openssl rand -hex 32
```

### 1. Create a read-only MySQL user

```sql
CREATE USER 'mcp_ro'@'localhost' IDENTIFIED BY '<strong password>';
GRANT SELECT ON your_database.* TO 'mcp_ro'@'localhost';   -- or grant per table / view
```

Grant only what the assistant needs (ideally views that omit PII). Never grant `FILE`, `SUPER`, or `EXECUTE`.

### 2. Connect from VS Code

Add to `.vscode/mcp.json` (see [`examples/vscode-mcp.json`](examples/vscode-mcp.json)):

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "mysql-mcp-token",
      "description": "MySQL MCP bearer token",
      "password": true
    }
  ],
  "servers": {
    "mysql": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer ${input:mysql-mcp-token}" }
    }
  }
}
```

### Using WSL?

`localhost` inside WSL is **not** your Windows host. If the server runs on Windows and VS Code runs in
WSL, enable mirrored networking in `%UserProfile%\.wslconfig` and run `wsl --shutdown`:

```ini
[wsl2]
networkingMode=mirrored
```

### stdio mode

Set `MCP_TRANSPORT=stdio` and register the server as a command:

```json
{
  "servers": {
    "mysql": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/index.js"],
      "envFile": "${workspaceFolder}/.env"
    }
  }
}
```

## Configuration

| Variable                              | Default              | Description                         |
| ------------------------------------- | -------------------- | ----------------------------------- |
| `DB_HOST` / `DB_PORT`                 | `localhost` / `3306` | MySQL address                       |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | – (required)         | Credentials and database            |
| `MCP_TRANSPORT`                       | `http`               | `http` or `stdio`                   |
| `MCP_HOST` / `MCP_PORT`               | `127.0.0.1` / `3000` | HTTP bind address                   |
| `MCP_AUTH_TOKEN`                      | –                    | **Required for http**, min 16 chars |
| `QUERY_MAX_ROWS`                      | `200`                | Max rows returned                   |
| `QUERY_TIMEOUT_MS`                    | `5000`               | Server-side query timeout           |
| `MAX_RESPONSE_CHARS`                  | `50000`              | Max response payload size           |

## Authentication

The server uses a **single shared bearer token** (`MCP_AUTH_TOKEN`):

- The client sends `Authorization: Bearer <token>` on every request to `/mcp`; the server compares it in constant time and returns `401` on mismatch.
- VS Code asks for the token once via the `promptString` input, so it never has to be written into `mcp.json`.
- To rotate: change `MCP_AUTH_TOKEN` in `.env`, restart the server, and re-enter the token in VS Code.

**Limitations:** anyone holding the token has full access, and the server cannot tell users apart (no accounts, roles, or per-user audit trail). This is appropriate for a single developer on a loopback-only server.

If you share the server or expose it beyond localhost, consider:

1. **Per-user tokens** – map each token to a user name, log the user with every query, and revoke individually.
2. **OAuth 2.1** – the approach in the MCP spec, supported natively by VS Code. Validate JWTs from your identity provider (Entra ID, Okta, Auth0, …); `@modelcontextprotocol/express` provides `requireBearerAuth` and `mcpAuthMetadataRouter` for this. Pair it with per-role database users or views.
3. **Network controls** – a VPN or authenticating reverse proxy (mTLS, Tailscale, Cloudflare Access), always with HTTPS, since bearer tokens over plain HTTP can be sniffed.

## Endpoints

| Path            | Auth         | Purpose                      |
| --------------- | ------------ | ---------------------------- |
| `POST/GET /mcp` | Bearer token | MCP Streamable HTTP endpoint |
| `GET /health`   | none         | Liveness check               |

Smoke test:

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Development

```bash
npm run dev         # watch mode
npm run typecheck
npm test            # SQL guard unit tests
```

## Security notes

- **Treat query results as untrusted input to the model.** Database content can contain prompt-injection text. Keep VS Code's tool-approval prompts on.
- The SQL guard is a convenience, not a security boundary — rely on the SELECT-only DB user.
- Don't expose this server beyond loopback. If you must bind `0.0.0.0`, firewall it and keep the token secret.
- Never commit `.env`. Rotate any credential that has ever been pasted into chat, logs, or source control.
- Query text is logged to stderr (first 200 chars). Don't put secrets in queries.

## License

MIT
