/**
 * Litestream configuration types and YAML generator
 *
 * Generates Litestream configuration for continuous WAL replication to Wasabi S3.
 */

/**
 * Wasabi S3 configuration for Litestream replicas
 */
export interface WasabiConfig {
  /** Wasabi endpoint URL (e.g., https://s3.wasabisys.com) */
  endpoint: string;
  /** Wasabi region (e.g., us-east-1) */
  region: string;
  /** S3 bucket name */
  bucket: string;
  /** Wasabi access key ID */
  accessKeyId: string;
  /** Wasabi secret access key */
  secretAccessKey: string;
}

/**
 * Full Litestream configuration for a database
 */
export interface LitestreamConfig {
  /** Whether Litestream replication is enabled */
  enabled: boolean;
  /** Service name (e.g., "crm", "bow") */
  service: string;
  /** Environment (e.g., "production", "staging", "dev") */
  environment: string;
  /** Path to the SQLite database file */
  dbPath: string;
  /** Wasabi S3 configuration */
  wasabi: WasabiConfig;
  /** WAL sync interval (default: "1s") */
  syncInterval?: string;
  /** Snapshot interval (default: "24h") */
  snapshotInterval?: string;
  /** Retention period for replicas (default: "168h" = 7 days) */
  retention?: string;
  /** Retention check interval (default: "1h") */
  retentionCheckInterval?: string;
}

/**
 * Information about a Litestream generation
 */
export interface GenerationInfo {
  /** Generation ID */
  id: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last updated timestamp */
  updatedAt: Date;
  /** Number of WAL segments */
  segmentCount: number;
}

/**
 * Get the S3 path for a service's Litestream replica
 *
 * @param service - Service name
 * @param environment - Environment name
 * @returns S3 path in format: {environment}/{service}
 */
export function getLitestreamPath(service: string, environment: string): string {
  return `${environment}/${service}`;
}

/**
 * Generate Litestream YAML configuration
 *
 * @param config - Litestream configuration
 * @returns YAML configuration string
 */
export function generateLitestreamYaml(config: LitestreamConfig): string {
  const syncInterval = config.syncInterval || "1s";
  const snapshotInterval = config.snapshotInterval || "24h";
  const retention = config.retention || "168h";
  const retentionCheckInterval = config.retentionCheckInterval || "1h";

  const replicaPath = getLitestreamPath(config.service, config.environment);

  return `# Litestream configuration for ${config.service} (${config.environment})
# Auto-generated - do not edit manually

dbs:
  - path: ${config.dbPath}
    replicas:
      - type: s3
        bucket: ${config.wasabi.bucket}
        path: ${replicaPath}
        endpoint: ${config.wasabi.endpoint}
        region: ${config.wasabi.region}
        access-key-id: ${config.wasabi.accessKeyId}
        secret-access-key: ${config.wasabi.secretAccessKey}
        sync-interval: ${syncInterval}
        snapshot-interval: ${snapshotInterval}
        retention: ${retention}
        retention-check-interval: ${retentionCheckInterval}
`;
}

/**
 * Generate Litestream YAML configuration for multiple databases
 * Used by Platform service which has both platform.db and auth.db
 *
 * @param configs - Array of Litestream configurations
 * @returns YAML configuration string
 */
export function generateMultiDbLitestreamYaml(configs: LitestreamConfig[]): string {
  if (configs.length === 0) {
    throw new Error("At least one database configuration is required");
  }

  const syncInterval = configs[0].syncInterval || "1s";
  const snapshotInterval = configs[0].snapshotInterval || "24h";
  const retention = configs[0].retention || "168h";
  const retentionCheckInterval = configs[0].retentionCheckInterval || "1h";

  const dbEntries = configs.map((config) => {
    const replicaPath = getLitestreamPath(config.service, config.environment);
    return `  - path: ${config.dbPath}
    replicas:
      - type: s3
        bucket: ${config.wasabi.bucket}
        path: ${replicaPath}
        endpoint: ${config.wasabi.endpoint}
        region: ${config.wasabi.region}
        access-key-id: ${config.wasabi.accessKeyId}
        secret-access-key: ${config.wasabi.secretAccessKey}
        sync-interval: ${syncInterval}
        snapshot-interval: ${snapshotInterval}
        retention: ${retention}
        retention-check-interval: ${retentionCheckInterval}`;
  });

  return `# Litestream configuration for multiple databases
# Auto-generated - do not edit manually

dbs:
${dbEntries.join("\n\n")}
`;
}

/**
 * Read Wasabi configuration from environment variables
 *
 * @returns WasabiConfig populated from environment
 */
export function readWasabiConfigFromEnv(): WasabiConfig {
  return {
    endpoint: Deno.env.get("WASABI_ENDPOINT") || "https://s3.wasabisys.com",
    region: Deno.env.get("WASABI_REGION") || "us-east-1",
    bucket: Deno.env.get("WASABI_BUCKET") || "p2b-backups",
    accessKeyId: Deno.env.get("WASABI_ACCESS_KEY_ID") || "",
    secretAccessKey: Deno.env.get("WASABI_SECRET_ACCESS_KEY") || "",
  };
}

/**
 * Validate Wasabi configuration
 *
 * @param config - WasabiConfig to validate
 * @throws Error if configuration is invalid
 */
export function validateWasabiConfig(config: WasabiConfig): void {
  if (!config.endpoint) {
    throw new Error("Wasabi endpoint is required");
  }
  if (!config.region) {
    throw new Error("Wasabi region is required");
  }
  if (!config.bucket) {
    throw new Error("Wasabi bucket is required");
  }
  if (!config.accessKeyId) {
    throw new Error("Wasabi access key ID is required");
  }
  if (!config.secretAccessKey) {
    throw new Error("Wasabi secret access key is required");
  }
}
