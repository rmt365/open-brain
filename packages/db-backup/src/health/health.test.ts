/**
 * Tests for refactored health modules
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Database } from "sqlite3";
import { checkIntegrity, verifyBackup } from "./integrity.ts";
import { vacuum, shouldVacuum, getDatabaseStats, enableAutoVacuum } from "./vacuum.ts";
import { autoRepair } from "./repair.ts";
import { checkStartupHealth } from "./startup.ts";
import { startHealthScheduler, DatabaseHealthScheduler } from "./scheduler.ts";

const TEST_DB_PATH = "/tmp/test-health-modules.db";

// Setup: Create a proper test database
Deno.test("Setup - create test database with tables", () => {
  try {
    Deno.removeSync(TEST_DB_PATH);
    Deno.removeSync(TEST_DB_PATH + "-wal");
    Deno.removeSync(TEST_DB_PATH + "-shm");
  } catch {
    // Ignore
  }

  const db = new Database(TEST_DB_PATH);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;

    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE
    );

    CREATE TABLE posts (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    INSERT INTO users (name, email) VALUES
      ('Alice', 'alice@example.com'),
      ('Bob', 'bob@example.com');

    INSERT INTO posts (user_id, title) VALUES
      (1, 'First Post'),
      (2, 'Second Post');
  `);
  db.close();
});

// ============================================================================
// integrity.ts tests
// ============================================================================

Deno.test("checkIntegrity - returns ok for healthy database", () => {
  const result = checkIntegrity(TEST_DB_PATH);

  assertEquals(result.ok, true);
  assertEquals(result.errors.length, 0);
  assertEquals(result.checks.quickCheck, true);
});

Deno.test("checkIntegrity - checks foreign keys", () => {
  const result = checkIntegrity(TEST_DB_PATH, { checkForeignKeys: true });

  assertEquals(result.ok, true);
  assertEquals(result.checks.foreignKeys, true);
});

Deno.test("checkIntegrity - performs quick check", () => {
  const result = checkIntegrity(TEST_DB_PATH, { quickCheck: true });

  assertEquals(result.ok, true);
  assertEquals(result.checks.quickCheck, true);
});

Deno.test("checkIntegrity - performs full integrity check when requested", () => {
  const result = checkIntegrity(TEST_DB_PATH, { fullIntegrityCheck: true });

  assertEquals(result.ok, true);
  assertEquals(result.checks.integrityCheck, true);
});

Deno.test("verifyBackup - returns true for valid database", async () => {
  const result = await verifyBackup(TEST_DB_PATH);
  assertEquals(result, true);
});

Deno.test("verifyBackup - returns false for non-existent file", async () => {
  const result = await verifyBackup("/non-existent-dir/fake.db");
  assertEquals(result, false);
});

// ============================================================================
// vacuum.ts tests
// ============================================================================

Deno.test("getDatabaseStats - returns stats for database", () => {
  const stats = getDatabaseStats(TEST_DB_PATH);

  assertExists(stats);
  assertEquals(typeof stats.pageCount, "number");
  assertEquals(typeof stats.freelistCount, "number");
  assertEquals(typeof stats.pageSize, "number");
  assertEquals(typeof stats.totalSize, "number");
  assertEquals(typeof stats.freeSpace, "number");
  assertEquals(typeof stats.utilizationPercentage, "number");
});

Deno.test("shouldVacuum - returns boolean for healthy database", () => {
  const result = shouldVacuum(TEST_DB_PATH);

  // Result should be a boolean
  assertEquals(typeof result, "boolean");
});

Deno.test("vacuum - successfully vacuums database", async () => {
  const result = await vacuum(TEST_DB_PATH);

  assertEquals(result.success, true);
  assertExists(result.sizeBefore);
  assertExists(result.sizeAfter);
  assertEquals(typeof result.duration, "number");
});

Deno.test("enableAutoVacuum - enables auto vacuum without error", () => {
  // enableAutoVacuum returns void, just verify it doesn't throw
  enableAutoVacuum(TEST_DB_PATH, "INCREMENTAL");
  // If we get here, the test passed
  assertEquals(true, true);
});

// ============================================================================
// repair.ts tests
// ============================================================================

Deno.test("autoRepair - runs on healthy database with strategy 'none'", async () => {
  const result = await autoRepair(TEST_DB_PATH);

  assertEquals(result.success, true);
  assertEquals(result.repairStrategy, "none");
});

// ============================================================================
// startup.ts tests
// ============================================================================

Deno.test("checkStartupHealth - returns healthy for good database", async () => {
  const result = await checkStartupHealth({
    dbPath: TEST_DB_PATH,
    service: "test-service",
    autoRepair: false,
  });

  assertEquals(result.degraded, false);
  assertEquals(result.integrityResult.ok, true);
});

// ============================================================================
// scheduler.ts tests
// ============================================================================

Deno.test("startHealthScheduler - creates scheduler handle", () => {
  let issueDetected = false;

  const handle = startHealthScheduler({
    dbPath: TEST_DB_PATH,
    service: "test-service",
    intervalMs: 60000, // 1 minute (won't actually run in test)
    onIssueDetected: () => {
      issueDetected = true;
    },
  });

  assertExists(handle.runCheck);
  assertExists(handle.stop);
  assertExists(handle.isRunning);

  assertEquals(handle.isRunning(), true);

  // Stop it
  handle.stop();
  assertEquals(handle.isRunning(), false);
});

Deno.test("startHealthScheduler - runCheck returns result", async () => {
  const handle = startHealthScheduler({
    dbPath: TEST_DB_PATH,
    service: "test-service",
    intervalMs: 60000,
    onIssueDetected: () => {},
  });

  const result = await handle.runCheck();

  assertEquals(result.ok, true);
  assertEquals(result.errors.length, 0);

  handle.stop();
});

Deno.test("DatabaseHealthScheduler class - backward compatibility", async () => {
  const scheduler = new DatabaseHealthScheduler({
    dbPath: TEST_DB_PATH,
    service: "test-service",
    intervalMs: 60000,
  });

  scheduler.start();

  // Should be running
  const result = await scheduler.runCheck();
  assertEquals(result.ok, true);

  scheduler.stop();
});

// Cleanup
Deno.test("Cleanup - remove test database", () => {
  try {
    Deno.removeSync(TEST_DB_PATH);
    Deno.removeSync(TEST_DB_PATH + "-wal");
    Deno.removeSync(TEST_DB_PATH + "-shm");
  } catch {
    // Ignore
  }
});
