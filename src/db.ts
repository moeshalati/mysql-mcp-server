import * as mysql from 'mysql2/promise';
import { config } from './config.js';
import { guardSql } from './sql-guard.js';

export const pool = mysql.createPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    connectionLimit: 4,
    multipleStatements: false,
});

export interface QueryResult {
    rows: unknown[];
    truncated: boolean;
}

/** Runs a guarded, read-only query with a row cap and server-side timeout. */
export async function runReadOnlyQuery(rawSql: string): Promise<QueryResult> {
    const guard = guardSql(rawSql);
    if (!guard.ok) throw new Error(guard.reason);

    const conn = await pool.getConnection();
    try {
        await conn.query(`SET SESSION max_execution_time = ${Number(config.QUERY_TIMEOUT_MS)}`);
        await conn.query('START TRANSACTION READ ONLY');
        const [result] = await conn.query({ sql: guard.sql, timeout: config.QUERY_TIMEOUT_MS + 2000 });
        await conn.query('ROLLBACK');

        const all = Array.isArray(result) ? result : [result];
        const truncated = all.length > config.QUERY_MAX_ROWS;
        return { rows: all.slice(0, config.QUERY_MAX_ROWS), truncated };
    } catch (err) {
        await conn.query('ROLLBACK').catch(() => undefined);
        throw err;
    } finally {
        conn.release();
    }
}
