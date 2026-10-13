/**
 * Defense-in-depth check for model-supplied SQL. The real read-only guarantee is
 * the SELECT-only MySQL user plus a READ ONLY transaction (see db.ts); this just
 * rejects obviously unwanted statements early with a clear message.
 */

const FORBIDDEN = /\b(into\s+(outfile|dumpfile)|for\s+update|lock\s+in\s+share\s+mode|load_file|sleep|benchmark|get_lock|release_lock)\b/i;

/** Strip comments and string literals so keyword checks can't be fooled or trip on data. */
function stripNoise(sql: string): string {
    // Single pass so a comment marker inside a string (or a quote inside a comment) is never misread.
    return sql.replace(
        /'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.|"")*"|\/\*[\s\S]*?\*\/|--[ \t][^\n]*|#[^\n]*/g,
        m => (m[0] === "'" ? "''" : m[0] === '"' ? '""' : ' '),
    );
}

export type GuardResult = { ok: true; sql: string } | { ok: false; reason: string };

export function guardSql(raw: string): GuardResult {
    const cleaned = stripNoise(raw).trim().replace(/;+\s*$/, '');

    if (!cleaned) return { ok: false, reason: 'Empty query.' };
    if (cleaned.includes(';')) return { ok: false, reason: 'Multiple statements are not allowed.' };
    if (!/^(select|with|show|describe|desc|explain)\b/i.test(cleaned)) {
        return { ok: false, reason: 'Only SELECT, WITH, SHOW, DESCRIBE and EXPLAIN statements are allowed.' };
    }
    if (FORBIDDEN.test(cleaned)) {
        return { ok: false, reason: 'Query contains a forbidden construct (file access, locking, or sleep/benchmark).' };
    }
    return { ok: true, sql: raw.trim().replace(/;+\s*$/, '') };
}
