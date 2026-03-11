/**
 * Comprehensive test suite for database backup system
 *
 * Tests all major functionality including:
 * - Encryption/decryption
 * - Backup creation and restoration
 * - Sanitization
 * - Integrity checking
 * - Error handling
 * - Edge cases
 */

import { assertEquals, assertExists, assert, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { exists } from 'std/fs';
import { Database } from 'sqlite3';
import {
  generateEncryptionKey,
  encrypt,
  decrypt,
  encryptFile,
  decryptFile,
  serializeEncrypted,
  deserializeEncrypted,
  sha256
} from './encryption/crypto.ts';
import { DatabaseSanitizer, sanitizeDatabase } from './sanitization/sanitizer.ts';
import type { SanitizationRules } from './types.ts';
import { checkIntegrity } from './health/integrity.ts';
import { vacuum, shouldVacuum } from './health/vacuum.ts';
import { backupToMemory, restoreFromMemory, getDatabaseSize } from './backup/sqliteBackup.ts';

// ===== Test Utilities =====

async function createTestDatabase(path: string): Promise<void> {
  const db = new Database(path);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      address TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      token TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT,
      level TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Insert test data
  const userStmt = db.prepare('INSERT INTO users (email, name, phone, address) VALUES (?, ?, ?, ?)');
  for (let i = 0; i < 50; i++) {
    userStmt.run(
      `user${i}@test.com`,
      `Test User ${i}`,
      `555-0${String(i).padStart(3, '0')}`,
      `${i * 100} Test St`
    );
  }

  const sessionStmt = db.prepare('INSERT INTO sessions (user_id, token) VALUES (?, ?)');
  for (let i = 0; i < 100; i++) {
    sessionStmt.run(
      (i % 50) + 1,
      `token_${crypto.randomUUID()}`
    );
  }

  const logStmt = db.prepare('INSERT INTO logs (message, level) VALUES (?, ?)');
  for (let i = 0; i < 200; i++) {
    logStmt.run(`Log message ${i}`, i % 2 === 0 ? 'INFO' : 'ERROR');
  }

  db.close();
}

async function verifyDatabaseContent(path: string, expectedUserCount: number, expectedSessionCount: number): Promise<boolean> {
  const db = new Database(path);
  try {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get<{ count: number }>()?.count || 0;
    const sessionCount = db.prepare('SELECT COUNT(*) as count FROM sessions').get<{ count: number }>()?.count || 0;

    return userCount === expectedUserCount && sessionCount === expectedSessionCount;
  } finally {
    db.close();
  }
}

// ===== Encryption Tests =====

Deno.test({
  name: 'Encryption - Generate encryption key',
  async fn() {
    const key1 = await generateEncryptionKey();
    const key2 = await generateEncryptionKey();

    assertEquals(typeof key1, 'string');
    assertEquals(typeof key2, 'string');
    assert(key1.length > 0);
    assert(key2.length > 0);
    assert(key1 !== key2, 'Keys should be different');
  },
});

Deno.test({
  name: 'Encryption - Encrypt and decrypt small data',
  async fn() {
    const key = await generateEncryptionKey();
    const originalData = new TextEncoder().encode('Hello, World!');

    const encrypted = await encrypt(originalData, { key });

    assertExists(encrypted.iv);
    assertExists(encrypted.ciphertext);
    assertEquals(encrypted.iv.length, 12); // IV length for GCM

    const decrypted = await decrypt(encrypted, { key });
    const decryptedText = new TextDecoder().decode(decrypted);

    assertEquals(decryptedText, 'Hello, World!');
  },
});

Deno.test({
  name: 'Encryption - Encrypt and decrypt large data',
  async fn() {
    const key = await generateEncryptionKey();
    // Generate large data in chunks (crypto.getRandomValues has 65536 byte limit)
    const largeData = new Uint8Array(1024 * 100); // 100KB
    const chunkSize = 65536;
    for (let i = 0; i < largeData.length; i += chunkSize) {
      const chunk = largeData.subarray(i, Math.min(i + chunkSize, largeData.length));
      crypto.getRandomValues(chunk);
    }

    const encrypted = await encrypt(largeData, { key });
    const decrypted = await decrypt(encrypted, { key });

    assertEquals(decrypted.length, largeData.length);
    assertEquals(Array.from(decrypted), Array.from(largeData));
  },
});

Deno.test({
  name: 'Encryption - Wrong key should fail decryption',
  async fn() {
    const key1 = await generateEncryptionKey();
    const key2 = await generateEncryptionKey();
    const data = new TextEncoder().encode('Secret message');

    const encrypted = await encrypt(data, { key: key1 });

    await assertRejects(
      async () => await decrypt(encrypted, { key: key2 }),
      Error,
      'Decryption failed'
    );
  },
});

Deno.test({
  name: 'Encryption - Serialize and deserialize',
  async fn() {
    const key = await generateEncryptionKey();
    const data = new TextEncoder().encode('Test data');

    const encrypted = await encrypt(data, { key });
    const serialized = serializeEncrypted(encrypted);
    const deserialized = deserializeEncrypted(serialized);

    assertEquals(deserialized.iv.length, encrypted.iv.length);
    assertEquals(deserialized.ciphertext.length, encrypted.ciphertext.length);
    assertEquals(Array.from(deserialized.iv), Array.from(encrypted.iv));
    assertEquals(Array.from(deserialized.ciphertext), Array.from(encrypted.ciphertext));
  },
});

Deno.test({
  name: 'Encryption - Encrypt file with compression',
  async fn() {
    const key = await generateEncryptionKey();

    // Create repetitive data that compresses well
    const repetitiveData = new TextEncoder().encode('A'.repeat(10000));

    const encrypted = await encryptFile(repetitiveData, { key }, true);
    const decrypted = await decryptFile(encrypted, { key }, true);

    assertEquals(decrypted.length, repetitiveData.length);
    assert(encrypted.length < repetitiveData.length, 'Encrypted data should be smaller due to compression');
  },
});

Deno.test({
  name: 'Encryption - SHA256 hash consistency',
  async fn() {
    const data = new TextEncoder().encode('Test data for hashing');

    const hash1 = await sha256(data);
    const hash2 = await sha256(data);

    assertEquals(hash1, hash2);
    assertEquals(hash1.length, 64); // SHA-256 produces 64 hex characters
  },
});

// ===== SQLite Backup Tests =====

Deno.test({
  name: 'SQLite Backup - Backup to memory',
  async fn() {
    const dbPath = await Deno.makeTempFile({ suffix: '.db' });
    try {
      await createTestDatabase(dbPath);

      const backupData = await backupToMemory(dbPath);

      assertExists(backupData);
      assert(backupData.length > 0);

      const originalSize = await getDatabaseSize(dbPath);
      assert(backupData.length > originalSize * 0.8, 'Backup should be similar size to original');
    } finally {
      await Deno.remove(dbPath);
    }
  },
});

Deno.test({
  name: 'SQLite Backup - Restore from memory',
  async fn() {
    const sourceDb = await Deno.makeTempFile({ suffix: '.db' });
    const targetDb = await Deno.makeTempFile({ suffix: '.db' });

    try {
      await createTestDatabase(sourceDb);

      const backupData = await backupToMemory(sourceDb);
      await restoreFromMemory(backupData, targetDb, true);

      assert(await exists(targetDb));

      // Verify content matches
      const contentMatches = await verifyDatabaseContent(targetDb, 50, 100);
      assert(contentMatches, 'Restored database should have same content');
    } finally {
      await Deno.remove(sourceDb);
      await Deno.remove(targetDb);
    }
  },
});

Deno.test({
  name: 'SQLite Backup - Restore without overwrite should fail',
  async fn() {
    const sourceDb = await Deno.makeTempFile({ suffix: '.db' });
    const targetDb = await Deno.makeTempFile({ suffix: '.db' });

    try {
      await createTestDatabase(sourceDb);
      await createTestDatabase(targetDb); // Create target so it exists

      const backupData = await backupToMemory(sourceDb);

      await assertRejects(
        async () => await restoreFromMemory(backupData, targetDb, false),
        Error,
        'already exists'
      );
    } finally {
      await Deno.remove(sourceDb);
      await Deno.remove(targetDb);
    }
  },
});

// ===== Sanitization Tests =====

Deno.test({
  name: 'Sanitization - Hash strategy',
  async fn() {
    const dbPath = await Deno.makeTempFile({ suffix: '.db' });

    try {
      await createTestDatabase(dbPath);

      const db = new Database(dbPath);
      const originalEmail = db.prepare('SELECT email FROM users WHERE id = 1').get<{ email: string }>()?.email;

      const sanitizer = new DatabaseSanitizer(db);
      await sanitizer.sanitize({
        tables: {
          users: {
            columns: {
              email: 'hash',
            },
          },
        },
      });

      const hashedEmail = db.prepare('SELECT email FROM users WHERE id = 1').get<{ email: string }>()?.email;
      db.close();

      assert(hashedEmail !== originalEmail, 'Email should be hashed');
      assertEquals(hashedEmail!.length, 64); // SHA-256 hash length
    } finally {
      await Deno.remove(dbPath);
    }
  },
});

Deno.test({
  name: 'Sanitization - Clear strategy',
  async fn() {
    const dbPath = await Deno.makeTempFile({ suffix: '.db' });

    try {
      await createTestDatabase(dbPath);

      const db = new Database(dbPath);
      const sanitizer = new DatabaseSanitizer(db);
      await sanitizer.sanitize({
        tables: {
          users: {
            columns: {
              phone: 'clear',
            },
          },
        },
      });

      const clearedPhone = db.prepare('SELECT phone FROM users WHERE id = 1').get<{ phone: string | null }>()?.phone;
      db.close();

      assertEquals(clearedPhone, null);
    } finally {
      await Deno.remove(dbPath);
    }
  },
});

Deno.test({
  name: 'Sanitization - Anonymize strategy',
  async fn() {
    const dbPath = await Deno.makeTempFile({ suffix: '.db' });

    try {
      await createTestDatabase(dbPath);

      const db = new Database(dbPath);
      const originalName = db.prepare('SELECT name FROM users WHERE id = 1').get<{ name: string }>()?.name;

      const sanitizer = new DatabaseSanitizer(db);
      await sanitizer.sanitize({
        tables: {
          users: {
            columns: {
              name: 'anonymize',
            },
          },
        },
      });

      const anonymizedName = db.prepare('SELECT name FROM users WHERE id = 1').get<{ name: string }>()?.name;
      db.close();

      assert(anonymizedName !== originalName, 'Name should be anonymized');
      assert(anonymizedName!.length > 0, 'Anonymized name should not be empty');
    } finally {
      await Deno.remove(dbPath);
    }
  },
});

Deno.test({
  name: 'Sanitization - Delete rows',
  async fn() {
    const dbPath = await Deno.makeTempFile({ suffix: '.db' });

    try {
      await createTestDatabase(dbPath);

      const db = new Database(dbPath);
      const originalCount = db.prepare('SELECT COUNT(*) as count FROM sessions').get<{ count: number }>()?.count;

      const sanitizer = new DatabaseSanitizer(db);
      await sanitizer.sanitize({
        tables: {
          sessions: {
            deleteWhere: '1=1', // Delete all sessions
          },
        },
      });

      const newCount = db.prepare('SELECT COUNT(*) as count FROM sessions').get<{ count: number }>()?.count;
      db.close();

      assertEquals(originalCount, 100);
      assertEquals(newCount, 0);
    } finally {
      await Deno.remove(dbPath);
    }
  },
});

Deno.test({
  name: 'Sanitization - Combined strategies',
  async fn() {
    const dbPath = await Deno.makeTempFile({ suffix: '.db' });

    try {
      await createTestDatabase(dbPath);

      const rules: SanitizationRules = {
        tables: {
          users: {
            columns: {
              email: 'hash',
              phone: 'clear',
              name: 'anonymize',
              address: 'anonymize',
            },
          },
          sessions: {
            deleteWhere: '1=1',
          },
        },
      };

      const db = new Database(dbPath);
      const sanitizer = new DatabaseSanitizer(db);
      await sanitizer.sanitize(rules);

      const user = db.prepare('SELECT email, phone, name, address FROM users WHERE id = 1').get<{
        email: string;
        phone: string | null;
        name: string;
        address: string;
      }>();

      const sessionCount = db.prepare('SELECT COUNT(*) as count FROM sessions').get<{ count: number }>()?.count;
      db.close();

      // Verify sanitization
      assertEquals(user!.email.length, 64); // Hashed
      assertEquals(user!.phone, null); // Cleared
      assert(!user!.name.includes('Test User'), 'Name should be anonymized');
      assert(!user!.address.includes('Test St'), 'Address should be anonymized');
      assertEquals(sessionCount, 0); // All deleted
    } finally {
      await Deno.remove(dbPath);
    }
  },
});

Deno.test({
  name: 'Sanitization - Sanitize database file',
  async fn() {
    const sourceDb = await Deno.makeTempFile({ suffix: '.db' });
    const targetDb = await Deno.makeTempFile({ suffix: '.db' });

    try {
      await createTestDatabase(sourceDb);
      await Deno.remove(targetDb); // Remove temp file so sanitizeDatabase can create it

      const rules: SanitizationRules = {
        tables: {
          users: {
            columns: {
              email: 'hash',
            },
          },
        },
      };

      await sanitizeDatabase(sourceDb, targetDb, rules);

      assert(await exists(targetDb));

      const db = new Database(targetDb);
      const email = db.prepare('SELECT email FROM users WHERE id = 1').get<{ email: string }>()?.email;
      db.close();

      assertEquals(email!.length, 64); // Hashed email
    } finally {
      await Deno.remove(sourceDb);
      if (await exists(targetDb)) await Deno.remove(targetDb);
    }
  },
});

// ===== Integrity Check Tests =====

Deno.test({
  name: 'Integrity - Check healthy database',
  async fn() {
    const dbPath = await Deno.makeTempFile({ suffix: '.db' });

    try {
      await createTestDatabase(dbPath);

      const result = checkIntegrity(dbPath, {
        checkForeignKeys: true,
        quickCheck: true,
        fullIntegrityCheck: true,
      });

      assertEquals(result.ok, true);
      assertEquals(result.checks.foreignKeys, true);
      assertEquals(result.checks.quickCheck, true);
      assertEquals(result.checks.integrityCheck, true);
      assertEquals(result.errors.length, 0);
    } finally {
      await Deno.remove(dbPath);
    }
  },
});

// ===== VACUUM Tests =====

Deno.test({
  name: 'VACUUM - Check if vacuum is needed',
  async fn() {
    const dbPath = await Deno.makeTempFile({ suffix: '.db' });

    try {
      await createTestDatabase(dbPath);

      // Delete half the data
      const db = new Database(dbPath);
      db.exec('DELETE FROM logs WHERE id % 2 = 0');
      db.close();

      const needed = await shouldVacuum(dbPath);
      // After deleting data, vacuum might be beneficial
      assertEquals(typeof needed, 'boolean');
    } finally {
      await Deno.remove(dbPath);
    }
  },
});

Deno.test({
  name: 'VACUUM - Execute vacuum',
  async fn() {
    const dbPath = await Deno.makeTempFile({ suffix: '.db' });

    try {
      await createTestDatabase(dbPath);

      // Delete significant data
      const db = new Database(dbPath);
      db.exec('DELETE FROM logs');
      db.close();

      const result = await vacuum(dbPath);

      assertEquals(result.success, true);
      assert(result.sizeBefore >= result.sizeAfter, 'Size after should be less than or equal to before');
      assertEquals(result.spaceReclaimed, result.sizeBefore - result.sizeAfter);
    } finally {
      await Deno.remove(dbPath);
    }
  },
});

// ===== End-to-End Integration Test =====

Deno.test({
  name: 'Integration - Full backup and restore cycle',
  async fn() {
    const key = await generateEncryptionKey();
    const sourceDb = await Deno.makeTempFile({ suffix: '.db' });
    const targetDb = await Deno.makeTempFile({ suffix: '.db' });

    try {
      // Create source database
      await createTestDatabase(sourceDb);

      // Backup to memory
      const dbData = await backupToMemory(sourceDb);
      const originalHash = await sha256(dbData);

      // Encrypt
      const encrypted = await encryptFile(dbData, { key }, true);

      // Decrypt
      const decrypted = await decryptFile(encrypted, { key }, true);
      const restoredHash = await sha256(decrypted);

      // Verify hash matches
      assertEquals(restoredHash, originalHash);

      // Restore to target
      await restoreFromMemory(decrypted, targetDb, true);

      // Verify content
      const contentMatches = await verifyDatabaseContent(targetDb, 50, 100);
      assert(contentMatches, 'Restored database should have same content');

      // Verify integrity
      const integrityCheck = checkIntegrity(targetDb);
      assertEquals(integrityCheck.ok, true);
    } finally {
      await Deno.remove(sourceDb);
      await Deno.remove(targetDb);
    }
  },
});

Deno.test({
  name: 'Integration - Backup, sanitize, and restore',
  async fn() {
    const key = await generateEncryptionKey();
    const sourceDb = await Deno.makeTempFile({ suffix: '.db' });
    const targetDb = await Deno.makeTempFile({ suffix: '.db' });

    try {
      // Create source database
      await createTestDatabase(sourceDb);

      // Backup
      const dbData = await backupToMemory(sourceDb);

      // Encrypt
      const encrypted = await encryptFile(dbData, { key }, true);

      // Decrypt
      const decrypted = await decryptFile(encrypted, { key }, true);

      // Write to temp for sanitization
      const tempDb = await Deno.makeTempFile({ suffix: '.db' });
      await Deno.writeFile(tempDb, decrypted);

      // Sanitize
      const db = new Database(tempDb);
      const sanitizer = new DatabaseSanitizer(db);
      await sanitizer.sanitize({
        tables: {
          users: {
            columns: {
              email: 'hash',
              phone: 'clear',
            },
          },
          sessions: {
            deleteWhere: '1=1',
          },
        },
      });
      db.close();

      // Read sanitized data
      const sanitizedData = await Deno.readFile(tempDb);
      await Deno.remove(tempDb);

      // Restore sanitized data
      await restoreFromMemory(sanitizedData, targetDb, true);

      // Verify sanitization worked
      const targetDbConn = new Database(targetDb);
      const user = targetDbConn.prepare('SELECT email, phone FROM users WHERE id = 1').get<{ email: string; phone: string | null }>();
      const sessionCount = targetDbConn.prepare('SELECT COUNT(*) as count FROM sessions').get<{ count: number }>()?.count;
      targetDbConn.close();

      assertEquals(user!.email.length, 64); // Hashed
      assertEquals(user!.phone, null); // Cleared
      assertEquals(sessionCount, 0); // Deleted
    } finally {
      await Deno.remove(sourceDb);
      await Deno.remove(targetDb);
    }
  },
});

console.log('✅ All comprehensive tests defined');
