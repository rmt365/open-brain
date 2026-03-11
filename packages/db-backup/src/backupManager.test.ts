/**
 * BackupManager Tests
 *
 * Basic integration tests for backup/restore functionality
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { BackupManager } from './backupManager.ts';
import { generateEncryptionKey } from './encryption/crypto.ts';
import type { BackupManagerConfig } from './types.ts';
import { exists } from 'std/fs';

// Test configuration (uses local filesystem instead of S3 for testing)
const TEST_DB_PATH = await Deno.makeTempFile({ suffix: '.db' });
const TEST_SERVICE = 'test-service';

async function createTestBackupManager(): Promise<BackupManager> {
  const encryptionKey = await generateEncryptionKey();

  // Note: For real tests, you'd need actual Wasabi credentials
  // These are placeholder values for illustration
  const config: BackupManagerConfig = {
    service: TEST_SERVICE,
    dbPath: TEST_DB_PATH,
    s3: {
      endpoint: 'https://s3.wasabisys.com',
      region: 'us-east-1',
      bucket: 'test-bucket',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    },
    encryption: {
      key: encryptionKey,
    },
    environment: 'test',
    retentionDays: 7,
  };

  return new BackupManager(config);
}

async function createTestDatabase(path: string): Promise<void> {
  const { Database } = await import('sqlite3');
  const db = new Database(path);

  // Create simple test schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_table (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      value INTEGER
    );
  `);

  // Insert test data
  const stmt = db.prepare('INSERT INTO test_table (name, value) VALUES (?, ?)');
  for (let i = 0; i < 100; i++) {
    stmt.run(`Test ${i}`, i);
  }

  db.close();
}

Deno.test('BackupManager - database file exists', async () => {
  await createTestDatabase(TEST_DB_PATH);
  assertExists(await Deno.stat(TEST_DB_PATH));
});

Deno.test('BackupManager - encryption key generation', async () => {
  const key1 = await generateEncryptionKey();
  const key2 = await generateEncryptionKey();

  assertEquals(typeof key1, 'string');
  assertEquals(typeof key2, 'string');
  assertEquals(key1.length, key2.length); // Should be same length
  assertEquals(key1 !== key2, true); // Should be different
});

// Note: The following tests require actual S3/Wasabi credentials and are skipped by default
// To run them, set environment variables and remove the 'ignore' flag

Deno.test({
  name: 'BackupManager - create backup',
  ignore: !Deno.env.get('RUN_S3_TESTS'), // Only run if explicitly enabled
  async fn() {
    await createTestDatabase(TEST_DB_PATH);
    const manager = await createTestBackupManager();

    const result = await manager.backup({
      environment: 'test',
      tags: { test: 'true' },
      verify: true,
    });

    assertEquals(result.success, true);
    assertExists(result.metadata.id);
    assertEquals(result.metadata.service, TEST_SERVICE);
  },
});

Deno.test({
  name: 'BackupManager - restore backup',
  ignore: !Deno.env.get('RUN_S3_TESTS'),
  async fn() {
    await createTestDatabase(TEST_DB_PATH);
    const manager = await createTestBackupManager();

    // Create backup
    const backupResult = await manager.backup();
    assertEquals(backupResult.success, true);

    const restorePath = await Deno.makeTempFile({ suffix: '.db' });

    // Restore backup
    const restoreResult = await manager.restore(backupResult.metadata.id, {
      targetPath: restorePath,
      verify: true,
    });

    assertEquals(restoreResult.success, true);
    assertEquals(await exists(restorePath), true);

    // Cleanup
    await Deno.remove(restorePath);
  },
});

Deno.test({
  name: 'BackupManager - integrity check',
  async fn() {
    await createTestDatabase(TEST_DB_PATH);
    const manager = await createTestBackupManager();

    const result = manager.integrityCheck();

    assertEquals(result.ok, true);
    assertEquals(result.checks.foreignKeys, true);
    assertEquals(result.checks.quickCheck, true);
  },
});

// Cleanup
Deno.test({
  name: 'Cleanup test database',
  async fn() {
    if (await exists(TEST_DB_PATH)) {
      await Deno.remove(TEST_DB_PATH);
    }
  },
});
