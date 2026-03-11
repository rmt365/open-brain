/**
 * Tests for health/common.ts utilities
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { withDatabase, withDatabaseAsync, checkpointWAL, getDatabasePageStats } from "./common.ts";
import { Database } from "sqlite3";

const TEST_DB_PATH = "/tmp/test-common-utils.db";

// Setup: Create test database
Deno.test("Setup - create test database", () => {
  // Remove if exists
  try {
    Deno.removeSync(TEST_DB_PATH);
  } catch {
    // Ignore if doesn't exist
  }

  const db = new Database(TEST_DB_PATH);
  db.exec(`
    CREATE TABLE test_table (
      id INTEGER PRIMARY KEY,
      name TEXT
    );
    INSERT INTO test_table (name) VALUES ('test1'), ('test2'), ('test3');
  `);
  db.close();
});

Deno.test("withDatabase - executes function with database connection", () => {
  const result = withDatabase(TEST_DB_PATH, (db) => {
    const row = db.prepare("SELECT COUNT(*) as count FROM test_table").value<[number]>();
    return row?.[0] ?? 0;
  });

  assertEquals(result, 3);
});

Deno.test("withDatabase - closes connection after function completes", () => {
  let dbInstance: Database | null = null;

  withDatabase(TEST_DB_PATH, (db) => {
    dbInstance = db;
    return true;
  });

  // The database should be closed after withDatabase returns
  // We can't directly test if it's closed, but we can verify a new connection works
  const result = withDatabase(TEST_DB_PATH, (db) => {
    return db.prepare("SELECT 1").value<[number]>()?.[0];
  });

  assertEquals(result, 1);
});

Deno.test("withDatabase - closes connection on error", () => {
  let threw = false;
  try {
    withDatabase(TEST_DB_PATH, (_db) => {
      throw new Error("Test error");
    });
  } catch {
    threw = true;
  }

  assertEquals(threw, true);

  // Should still be able to connect after error
  const result = withDatabase(TEST_DB_PATH, (db) => {
    return db.prepare("SELECT 1").value<[number]>()?.[0];
  });
  assertEquals(result, 1);
});

Deno.test("withDatabaseAsync - executes async function with database connection", async () => {
  const result = await withDatabaseAsync(TEST_DB_PATH, async (db) => {
    // Simulate async operation
    await new Promise((resolve) => setTimeout(resolve, 10));
    const row = db.prepare("SELECT COUNT(*) as count FROM test_table").value<[number]>();
    return row?.[0] ?? 0;
  });

  assertEquals(result, 3);
});

Deno.test("checkpointWAL - returns true for valid database", () => {
  // First enable WAL mode
  withDatabase(TEST_DB_PATH, (db) => {
    db.exec("PRAGMA journal_mode=WAL");
  });

  const result = checkpointWAL(TEST_DB_PATH, "PASSIVE");
  assertEquals(result, true);
});

Deno.test("checkpointWAL - returns false for invalid path", () => {
  // Use a path that can't be created (directory doesn't exist)
  const result = checkpointWAL("/non-existent-dir/non-existent-db.db", "PASSIVE");
  assertEquals(result, false);
});

Deno.test("checkpointWAL - supports different modes", () => {
  const modes = ["PASSIVE", "FULL", "RESTART", "TRUNCATE"] as const;

  for (const mode of modes) {
    const result = checkpointWAL(TEST_DB_PATH, mode);
    assertEquals(result, true, `Mode ${mode} should succeed`);
  }
});

Deno.test("getDatabasePageStats - returns stats for valid database", () => {
  const stats = withDatabase(TEST_DB_PATH, (db) => {
    return getDatabasePageStats(db);
  });

  assertExists(stats);
  assertEquals(typeof stats.pageCount, "number");
  assertEquals(typeof stats.freeListCount, "number");
  assertEquals(typeof stats.pageSize, "number");
  assertEquals(typeof stats.totalSize, "number");
  assertEquals(typeof stats.freeSpace, "number");
  assertEquals(typeof stats.utilizationPercent, "number");

  // Basic sanity checks
  assertEquals(stats.pageCount > 0, true);
  assertEquals(stats.pageSize > 0, true);
  assertEquals(stats.totalSize, stats.pageCount * stats.pageSize);
  assertEquals(stats.freeSpace, stats.freeListCount * stats.pageSize);
});

Deno.test("Cleanup - remove test database", () => {
  try {
    Deno.removeSync(TEST_DB_PATH);
    Deno.removeSync(TEST_DB_PATH + "-wal");
    Deno.removeSync(TEST_DB_PATH + "-shm");
  } catch {
    // Ignore cleanup errors
  }
});
