/**
 * Litestream restore utilities
 *
 * Provides functions to restore SQLite databases from Litestream replicas stored in Wasabi S3.
 * Uses temporary config files to work around S3-compatible storage credential issues.
 */

import { getLitestreamPath, type WasabiConfig, type GenerationInfo } from "./config.ts";

/**
 * Options for restoring from a Litestream replica
 */
export interface LitestreamRestoreOptions {
  /** Service name (e.g., "crm", "bow") */
  service: string;
  /** Environment (e.g., "production", "staging", "dev") */
  environment: string;
  /** Target path for the restored database */
  targetPath: string;
  /** Wasabi S3 configuration */
  wasabi: WasabiConfig;
  /** Optional timestamp for point-in-time recovery */
  timestamp?: Date;
  /** Only restore if the target database doesn't exist */
  ifNotExists?: boolean;
}

/**
 * Result of a Litestream restore operation
 */
export interface LitestreamRestoreResult {
  /** Whether the restore was successful */
  success: boolean;
  /** Timestamp when the restore completed */
  restoredAt?: Date;
  /** Generation ID that was restored */
  generationId?: string;
  /** Error message if restore failed */
  error?: string;
}

/**
 * Create a temporary Litestream config file for S3-compatible storage
 * This is required because URL-based credentials don't work reliably with Wasabi
 */
async function createTempConfig(
  service: string,
  environment: string,
  wasabi: WasabiConfig
): Promise<string> {
  const replicaPath = getLitestreamPath(service, environment);
  const tempPath = await Deno.makeTempFile({ prefix: "litestream-", suffix: ".yml" });

  const configYaml = `access-key-id: ${wasabi.accessKeyId}
secret-access-key: ${wasabi.secretAccessKey}

dbs:
  - path: /tmp/litestream-placeholder.db
    replicas:
      - type: s3
        bucket: ${wasabi.bucket}
        path: ${replicaPath}
        endpoint: ${wasabi.endpoint}
        region: ${wasabi.region}
`;

  await Deno.writeTextFile(tempPath, configYaml);
  return tempPath;
}

/**
 * Restore a database from Litestream replica in Wasabi S3
 *
 * Uses a temporary config file approach for S3-compatible stores like Wasabi.
 * The litestream binary must be available in the system PATH.
 *
 * @param options - Restore options
 * @returns Result of the restore operation
 */
export async function restoreFromLitestream(
  options: LitestreamRestoreOptions
): Promise<LitestreamRestoreResult> {
  let configPath: string | null = null;

  try {
    // Create temporary config file with credentials
    configPath = await createTempConfig(
      options.service,
      options.environment,
      options.wasabi
    );

    // Build litestream restore command arguments
    const args = ["restore", "-config", configPath];

    // Add output path
    args.push("-o", options.targetPath);

    // Add if-db-not-exists flag
    if (options.ifNotExists) {
      args.push("-if-db-not-exists");
    }

    // Add timestamp for point-in-time recovery
    if (options.timestamp) {
      args.push("-timestamp", options.timestamp.toISOString());
    }

    // Reference the placeholder db path from config (litestream uses it to find the replica)
    args.push("/tmp/litestream-placeholder.db");

    const cmd = new Deno.Command("litestream", {
      args,
      stdout: "piped",
      stderr: "piped",
    });

    const output = await cmd.output();
    const stdout = new TextDecoder().decode(output.stdout);
    const stderr = new TextDecoder().decode(output.stderr);

    if (!output.success) {
      // Check for "no matching backups" which is expected for new services
      if (stderr.includes("no matching backups") || stderr.includes("no generations found")) {
        return {
          success: false,
          error: `No replica found for ${options.service}/${options.environment}. This is expected for new services.`,
        };
      }

      return {
        success: false,
        error: stderr || `litestream restore failed with exit code ${output.code}`,
      };
    }

    // Parse generation ID from stdout if available
    let generationId: string | undefined;
    const genMatch = stdout.match(/generation[=:\s]+([a-f0-9]+)/i);
    if (genMatch) {
      generationId = genMatch[1];
    }

    return {
      success: true,
      restoredAt: new Date(),
      generationId,
    };
  } catch (error) {
    // Handle case where litestream binary is not found
    if (error instanceof Deno.errors.NotFound) {
      return {
        success: false,
        error: "litestream binary not found. Ensure litestream is installed and in PATH.",
      };
    }

    return {
      success: false,
      error: `Restore failed: ${(error as Error).message}`,
    };
  } finally {
    // Clean up temp config file
    if (configPath) {
      try {
        await Deno.remove(configPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * List available generations for a service's replica
 *
 * @param service - Service name
 * @param environment - Environment name
 * @param wasabi - Wasabi S3 configuration
 * @returns Array of generation information
 */
export async function listGenerations(
  service: string,
  environment: string,
  wasabi: WasabiConfig
): Promise<GenerationInfo[]> {
  let configPath: string | null = null;

  try {
    // Create temporary config file with credentials
    configPath = await createTempConfig(service, environment, wasabi);

    const cmd = new Deno.Command("litestream", {
      args: ["generations", "-config", configPath, "/tmp/litestream-placeholder.db"],
      stdout: "piped",
      stderr: "piped",
    });

    const output = await cmd.output();
    const stdout = new TextDecoder().decode(output.stdout);
    const stderr = new TextDecoder().decode(output.stderr);

    if (!output.success) {
      // No generations is not an error, just empty
      if (stderr.includes("no generations") || stderr.includes("not found")) {
        return [];
      }
      console.error(`Failed to list generations: ${stderr}`);
      return [];
    }

    // Parse generations output
    // Format: "name  generation  lag  start  end"
    const lines = stdout.trim().split("\n");
    const generations: GenerationInfo[] = [];

    for (const line of lines) {
      // Skip header line
      if (line.startsWith("name") || line.trim() === "") {
        continue;
      }

      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        // Generation ID is typically the second column
        const genId = parts[1] || parts[0];
        generations.push({
          id: genId,
          createdAt: new Date(),
          updatedAt: new Date(),
          segmentCount: 0,
        });
      }
    }

    return generations;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.error("litestream binary not found");
      return [];
    }
    console.error(`Failed to list generations: ${(error as Error).message}`);
    return [];
  } finally {
    // Clean up temp config file
    if (configPath) {
      try {
        await Deno.remove(configPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Check if a Litestream replica exists for a service
 *
 * @param service - Service name
 * @param environment - Environment name
 * @param wasabi - Wasabi S3 configuration
 * @returns True if at least one generation exists
 */
export async function replicaExists(
  service: string,
  environment: string,
  wasabi: WasabiConfig
): Promise<boolean> {
  const generations = await listGenerations(service, environment, wasabi);
  return generations.length > 0;
}

/**
 * Get the latest generation for a service's replica
 *
 * @param service - Service name
 * @param environment - Environment name
 * @param wasabi - Wasabi S3 configuration
 * @returns Latest generation info or null if none exist
 */
export async function getLatestGeneration(
  service: string,
  environment: string,
  wasabi: WasabiConfig
): Promise<GenerationInfo | null> {
  const generations = await listGenerations(service, environment, wasabi);
  if (generations.length === 0) {
    return null;
  }
  // Generations are typically listed in order, but sort by updated just in case
  generations.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return generations[0];
}
