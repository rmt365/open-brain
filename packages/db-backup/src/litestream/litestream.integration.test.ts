/**
 * Real-world Wasabi integration tests for Litestream
 *
 * Prerequisites:
 * - Set WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY environment variables
 * - Install litestream binary: https://litestream.io/install/
 * - Run with: deno test --allow-all src/litestream/litestream.integration.test.ts
 *
 * These tests use a dedicated test prefix to avoid collision with production data.
 * Test data is stored at: s3://bucket/litestream/litestream-test/integration/
 */

import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert";
import { Database } from "jsr:@db/sqlite@0.12";
import {
  generateLitestreamYaml,
  generateMultiDbLitestreamYaml,
  getLitestreamPath,
  readWasabiConfigFromEnv,
  validateWasabiConfig,
  type LitestreamConfig,
  type WasabiConfig,
} from "./config.ts";
import { restoreFromLitestream, listGenerations, replicaExists } from "./restore.ts";
import { checkLitestreamHealth, isLitestreamHealthy, formatLitestreamHealthResponse } from "./health.ts";

const TEST_SERVICE = "litestream-test";
const TEST_ENVIRONMENT = "integration";
const TEST_DB_PATH = "/tmp/litestream-integration-test.db";

// Skip tests if credentials not available
const hasCredentials = (): boolean => {
  const hasKeys = !!(Deno.env.get("WASABI_ACCESS_KEY_ID") && Deno.env.get("WASABI_SECRET_ACCESS_KEY"));
  if (!hasKeys) {
    console.log("  [SKIP] Wasabi credentials not set");
  }
  return hasKeys;
};

// Check if litestream binary is available
const hasLitestreamBinary = async (): Promise<boolean> => {
  try {
    const cmd = new Deno.Command("litestream", { args: ["version"], stdout: "piped", stderr: "piped" });
    const output = await cmd.output();
    return output.success;
  } catch {
    console.log("  [SKIP] litestream binary not found");
    return false;
  }
};

function getWasabiConfig(): WasabiConfig {
  return readWasabiConfigFromEnv();
}

// Helper to create test database with sample data
async function createTestDatabase(path: string, uniqueValue?: string): Promise<string> {
  // Remove existing
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      await Deno.remove(path + suffix);
    } catch {
      /* ignore */
    }
  }

  const db = new Database(path);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("CREATE TABLE IF NOT EXISTS test_data (id INTEGER PRIMARY KEY, value TEXT, created_at TEXT)");

  const testValue = uniqueValue || `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  db.exec(`INSERT INTO test_data (value, created_at) VALUES ('${testValue}', datetime('now'))`);
  db.close();

  return testValue;
}

// Helper to run litestream replicate for a short duration
async function runReplicateForDuration(
  config: LitestreamConfig,
  durationMs: number
): Promise<{ success: boolean; stderr: string }> {
  const yaml = generateLitestreamYaml(config);
  const configPath = "/tmp/litestream-test-config.yml";
  await Deno.writeTextFile(configPath, yaml);

  const cmd = new Deno.Command("litestream", {
    args: ["replicate", "-config", configPath],
    env: {
      LITESTREAM_ACCESS_KEY_ID: config.wasabi.accessKeyId,
      LITESTREAM_SECRET_ACCESS_KEY: config.wasabi.secretAccessKey,
    },
    stdout: "piped",
    stderr: "piped",
  });

  const process = cmd.spawn();

  // Let it replicate for specified duration
  await new Promise((resolve) => setTimeout(resolve, durationMs));

  // Kill the process gracefully
  process.kill("SIGTERM");

  // Wait for process to exit and collect output
  const output = await process.output();
  const stderr = new TextDecoder().decode(output.stderr);

  return { success: true, stderr };
}

// ============================================================================
// UNIT TESTS (No external dependencies)
// ============================================================================

Deno.test("getLitestreamPath - generates correct path", () => {
  const path = getLitestreamPath("crm", "production");
  assertEquals(path, "litestream/crm/production/crm");
});

Deno.test("getLitestreamPath - handles different environments", () => {
  assertEquals(getLitestreamPath("bow", "dev"), "litestream/bow/dev/bow");
  assertEquals(getLitestreamPath("platform", "staging"), "litestream/platform/staging/platform");
});

Deno.test("generateLitestreamYaml - creates valid YAML", () => {
  const config: LitestreamConfig = {
    enabled: true,
    service: "test-service",
    environment: "test",
    dbPath: "/app/database/test.db",
    wasabi: {
      endpoint: "https://s3.wasabisys.com",
      region: "us-east-1",
      bucket: "test-bucket",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
    syncInterval: "5s",
    retention: "48h",
  };

  const yaml = generateLitestreamYaml(config);

  assertStringIncludes(yaml, "/app/database/test.db");
  assertStringIncludes(yaml, "test-bucket");
  assertStringIncludes(yaml, "litestream/test-service/test/test-service");
  assertStringIncludes(yaml, "sync-interval: 5s");
  assertStringIncludes(yaml, "retention: 48h");
});

Deno.test("generateMultiDbLitestreamYaml - creates config for multiple databases", () => {
  const wasabi: WasabiConfig = {
    endpoint: "https://s3.wasabisys.com",
    region: "us-east-1",
    bucket: "test-bucket",
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
  };

  const configs: LitestreamConfig[] = [
    { enabled: true, service: "platform", environment: "prod", dbPath: "/app/database/platform.db", wasabi },
    { enabled: true, service: "auth", environment: "prod", dbPath: "/app/database/auth.db", wasabi },
  ];

  const yaml = generateMultiDbLitestreamYaml(configs);

  assertStringIncludes(yaml, "/app/database/platform.db");
  assertStringIncludes(yaml, "/app/database/auth.db");
  assertStringIncludes(yaml, "litestream/platform/prod/platform");
  assertStringIncludes(yaml, "litestream/auth/prod/auth");
});

Deno.test("validateWasabiConfig - validates required fields", () => {
  const validConfig: WasabiConfig = {
    endpoint: "https://s3.wasabisys.com",
    region: "us-east-1",
    bucket: "test-bucket",
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
  };

  // Should not throw for valid config
  validateWasabiConfig(validConfig);

  // Should throw for missing endpoint
  try {
    validateWasabiConfig({ ...validConfig, endpoint: "" });
    throw new Error("Should have thrown");
  } catch (e) {
    assertStringIncludes((e as Error).message, "endpoint");
  }

  // Should throw for missing bucket
  try {
    validateWasabiConfig({ ...validConfig, bucket: "" });
    throw new Error("Should have thrown");
  } catch (e) {
    assertStringIncludes((e as Error).message, "bucket");
  }
});

Deno.test("readWasabiConfigFromEnv - reads from environment", () => {
  // This test uses whatever is in the environment
  const config = readWasabiConfigFromEnv();

  // Should have defaults for endpoint and region
  assertExists(config.endpoint);
  assertExists(config.region);
  assertEquals(config.endpoint.includes("wasabi"), true);
});

// ============================================================================
// INTEGRATION TESTS (Require Wasabi credentials and litestream binary)
// ============================================================================

Deno.test({
  name: "Wasabi Integration - config generates valid YAML with real credentials",
  ignore: !hasCredentials(),
  fn: () => {
    const wasabi = getWasabiConfig();
    const config: LitestreamConfig = {
      enabled: true,
      service: TEST_SERVICE,
      environment: TEST_ENVIRONMENT,
      dbPath: TEST_DB_PATH,
      wasabi,
      syncInterval: "1s",
      retention: "24h",
    };

    const yaml = generateLitestreamYaml(config);

    assertExists(yaml);
    assertStringIncludes(yaml, TEST_DB_PATH);
    assertStringIncludes(yaml, wasabi.endpoint);
    assertStringIncludes(yaml, getLitestreamPath(TEST_SERVICE, TEST_ENVIRONMENT));
  },
});

Deno.test({
  name: "Wasabi Integration - replicate and restore roundtrip",
  ignore: !hasCredentials(),
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    // Check for litestream binary
    if (!(await hasLitestreamBinary())) {
      return;
    }

    const wasabi = getWasabiConfig();
    const config: LitestreamConfig = {
      enabled: true,
      service: TEST_SERVICE,
      environment: TEST_ENVIRONMENT,
      dbPath: TEST_DB_PATH,
      wasabi,
      syncInterval: "1s",
      retention: "24h",
    };

    // Step 1: Create test database with unique data
    const testValue = await createTestDatabase(TEST_DB_PATH);
    console.log(`  Created test database with value: ${testValue}`);

    // Step 2: Run litestream replicate for 5 seconds
    console.log("  Replicating to Wasabi (5s)...");
    const replicateResult = await runReplicateForDuration(config, 5000);
    console.log(`  Replication completed`);

    // Step 3: Delete local database
    await Deno.remove(TEST_DB_PATH);
    try {
      await Deno.remove(TEST_DB_PATH + "-wal");
    } catch {
      /* ignore */
    }
    try {
      await Deno.remove(TEST_DB_PATH + "-shm");
    } catch {
      /* ignore */
    }
    console.log("  Deleted local database");

    // Step 4: Restore from Wasabi
    console.log("  Restoring from Wasabi...");
    const restorePath = "/tmp/litestream-restored-test.db";
    const result = await restoreFromLitestream({
      service: TEST_SERVICE,
      environment: TEST_ENVIRONMENT,
      targetPath: restorePath,
      wasabi,
    });

    assertEquals(result.success, true, `Restore failed: ${result.error}`);
    console.log(`  Restore successful (generation: ${result.generationId || "unknown"})`);

    // Step 5: Verify restored data
    const restoredDb = new Database(restorePath, { readonly: true });
    const rows = restoredDb.prepare("SELECT value FROM test_data WHERE value = ?").all(testValue) as {
      value: string;
    }[];
    restoredDb.close();

    assertEquals(rows.length, 1, `Restored database should contain test value '${testValue}'`);
    console.log(`  Verified test value exists in restored database`);

    // Cleanup
    await Deno.remove(restorePath);
  },
});

Deno.test({
  name: "Wasabi Integration - listGenerations returns generations after replication",
  ignore: !hasCredentials(),
  fn: async () => {
    if (!(await hasLitestreamBinary())) {
      return;
    }

    const wasabi = getWasabiConfig();

    // This test relies on the roundtrip test having created at least one generation
    const generations = await listGenerations(TEST_SERVICE, TEST_ENVIRONMENT, wasabi);

    console.log(`  Found ${generations.length} generation(s)`);
    assertEquals(Array.isArray(generations), true);

    if (generations.length > 0) {
      console.log(`  Latest generation: ${generations[0].id}`);
      assertExists(generations[0].id);
      assertExists(generations[0].createdAt);
    }
  },
});

Deno.test({
  name: "Wasabi Integration - replicaExists returns correct status",
  ignore: !hasCredentials(),
  fn: async () => {
    if (!(await hasLitestreamBinary())) {
      return;
    }

    const wasabi = getWasabiConfig();

    // Test service should have replicas from previous test
    const exists = await replicaExists(TEST_SERVICE, TEST_ENVIRONMENT, wasabi);
    console.log(`  Replica exists for ${TEST_SERVICE}/${TEST_ENVIRONMENT}: ${exists}`);

    // Non-existent service should return false
    const notExists = await replicaExists("non-existent-service-xyz", "test", wasabi);
    assertEquals(notExists, false);
  },
});

Deno.test({
  name: "Wasabi Integration - checkLitestreamHealth returns status",
  ignore: !hasCredentials(),
  fn: async () => {
    if (!(await hasLitestreamBinary())) {
      return;
    }

    const wasabi = getWasabiConfig();

    const health = await checkLitestreamHealth(TEST_SERVICE, TEST_ENVIRONMENT, wasabi);

    assertExists(health);
    assertEquals(health.enabled, true);
    assertEquals(Array.isArray(health.errors), true);

    console.log(`  Health status: running=${health.running}, lag=${health.lagSeconds}s`);
    if (health.latestGeneration) {
      console.log(`  Latest generation: ${health.latestGeneration}`);
    }
  },
});

Deno.test({
  name: "Wasabi Integration - formatLitestreamHealthResponse returns formatted object",
  ignore: !hasCredentials(),
  fn: async () => {
    if (!(await hasLitestreamBinary())) {
      return;
    }

    const wasabi = getWasabiConfig();

    const health = await checkLitestreamHealth(TEST_SERVICE, TEST_ENVIRONMENT, wasabi);
    const formatted = formatLitestreamHealthResponse(health);

    assertExists(formatted.status);
    assertEquals(["healthy", "warning", "error", "disabled"].includes(formatted.status), true);
    console.log(`  Formatted status: ${formatted.status}`);
  },
});

Deno.test({
  name: "Wasabi Integration - restore with ifNotExists skips existing database",
  ignore: !hasCredentials(),
  fn: async () => {
    if (!(await hasLitestreamBinary())) {
      return;
    }

    const wasabi = getWasabiConfig();

    // Create a database at target path
    const targetPath = "/tmp/litestream-existing-test.db";
    const originalValue = await createTestDatabase(targetPath);

    // Attempt restore with ifNotExists=true
    const result = await restoreFromLitestream({
      service: TEST_SERVICE,
      environment: TEST_ENVIRONMENT,
      targetPath,
      wasabi,
      ifNotExists: true,
    });

    // Should succeed (no-op since database exists)
    assertEquals(result.success, true);

    // Verify original data is intact
    const db = new Database(targetPath, { readonly: true });
    const rows = db.prepare("SELECT value FROM test_data WHERE value = ?").all(originalValue) as { value: string }[];
    db.close();

    assertEquals(rows.length, 1, "Original data should be intact");

    // Cleanup
    await Deno.remove(targetPath);
  },
});

Deno.test({
  name: "Wasabi Integration - restore non-existent service fails gracefully",
  ignore: !hasCredentials(),
  fn: async () => {
    if (!(await hasLitestreamBinary())) {
      return;
    }

    const wasabi = getWasabiConfig();

    const result = await restoreFromLitestream({
      service: "non-existent-service-xyz-12345",
      environment: "test",
      targetPath: "/tmp/should-not-exist.db",
      wasabi,
    });

    // Should fail gracefully (no replica exists)
    assertEquals(result.success, false);
    assertExists(result.error);
    console.log(`  Expected error: ${result.error}`);

    // Verify file was not created
    try {
      await Deno.stat("/tmp/should-not-exist.db");
      throw new Error("File should not exist");
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) {
        throw e;
      }
    }
  },
});

Deno.test({
  name: "Wasabi Integration - health check for non-existent service",
  ignore: !hasCredentials(),
  fn: async () => {
    const wasabi = getWasabiConfig();

    const health = await checkLitestreamHealth("non-existent-xyz", "test", wasabi);

    assertEquals(health.enabled, true);
    assertEquals(health.running, false);
    assertEquals(health.latestGeneration, null);
    console.log(`  Expected: no generations found for non-existent service`);
  },
});

Deno.test({
  name: "Wasabi Integration - isLitestreamHealthy quick check",
  ignore: !hasCredentials(),
  fn: async () => {
    if (!(await hasLitestreamBinary())) {
      return;
    }

    const wasabi = getWasabiConfig();

    // Test service may or may not be healthy depending on recent replication
    const isHealthy = await isLitestreamHealthy(TEST_SERVICE, TEST_ENVIRONMENT, wasabi, 3600);
    console.log(`  isLitestreamHealthy (maxLag=1h): ${isHealthy}`);

    // Non-existent service should not be healthy
    const notHealthy = await isLitestreamHealthy("non-existent-xyz", "test", wasabi);
    assertEquals(notHealthy, false);
  },
});

// ============================================================================
// CLEANUP (Manual - enable when needed)
// ============================================================================

Deno.test({
  name: "Wasabi Integration - cleanup test artifacts (MANUAL)",
  ignore: true, // Enable manually when needed
  fn: async () => {
    // This test would delete test data from Wasabi
    // Implementation would use AWS SDK to delete litestream/litestream-test/ prefix
    console.log("Cleanup not implemented - manually delete:");
    console.log(`  aws s3 rm s3://p2b-backups/litestream/${TEST_SERVICE}/ --recursive --endpoint-url https://s3.wasabisys.com`);
  },
});
