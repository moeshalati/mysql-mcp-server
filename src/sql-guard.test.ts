import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardSql } from './sql-guard.js';

const ok = (s: string) => assert.equal(guardSql(s).ok, true, s);
const bad = (s: string) => assert.equal(guardSql(s).ok, false, s);

test('allows read-only statements', () => {
    ok('SELECT * FROM users');
    ok('  select 1;');
    ok('WITH a AS (SELECT 1) SELECT * FROM a');
    ok('SHOW TABLES');
    ok('DESCRIBE users');
    ok("SELECT * FROM t WHERE note = 'drop; table -- x'");
});

test('rejects writes and DDL', () => {
    bad('INSERT INTO t VALUES (1)');
    bad('UPDATE t SET a=1');
    bad('DELETE FROM t');
    bad('DROP TABLE t');
    bad('');
});

test('rejects stacked statements', () => {
    bad('SELECT 1; DROP TABLE t');
    bad('SELECT 1 /* x */; DELETE FROM t');
});

test('rejects dangerous constructs', () => {
    bad("SELECT * FROM t INTO OUTFILE '/tmp/x'");
    bad('SELECT * FROM t FOR UPDATE');
    bad('SELECT SLEEP(100)');
    bad("SELECT LOAD_FILE('/etc/passwd')");
    bad('SELECT/**/SLEEP(5)');
});
