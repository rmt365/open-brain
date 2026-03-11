/**
 * Database Backup System Types
 */

export type Environment = 'production' | 'staging' | 'dev' | 'test';

export type SanitizationStrategy = 'hash' | 'clear' | 'anonymize' | 'preserve';

/**
 * Backup metadata stored alongside encrypted backup files
 */
export interface BackupMetadata {
  /** Unique backup identifier */
  id: string;
  /** Service name (e.g., 'crm', 'bow', 'platform') */
  service: string;
  /** Environment the backup was taken from */
  environment: Environment;
  /** Timestamp of backup creation */
  timestamp: Date;
  /** Original database file size in bytes */
  originalSize: number;
  /** Compressed encrypted backup size in bytes */
  backupSize: number;
  /** SHA-256 hash of original database file */
  originalHash: string;
  /** SHA-256 hash of encrypted backup file */
  backupHash: string;
  /** SQLite database version */
  sqliteVersion: string;
  /** Whether backup was sanitized */
  sanitized: boolean;
  /** Encryption algorithm used */
  encryptionAlgorithm: 'AES-256-GCM';
  /** S3 bucket name */
  bucket: string;
  /** S3 object key */
  key: string;
  /** Optional backup tags */
  tags?: Record<string, string>;
  /** Optional notes */
  notes?: string;
}

/**
 * Sanitization rules for a database
 */
export interface SanitizationRules {
  tables: {
    [tableName: string]: {
      /** Column-level sanitization strategies */
      columns?: {
        [columnName: string]: SanitizationStrategy;
      };
      /** SQL WHERE clause to delete sensitive rows */
      deleteWhere?: string;
    };
  };
}

/**
 * Options for backup operation
 */
export interface BackupOptions {
  /** Environment label for this backup */
  environment?: Environment;
  /** Optional tags for backup metadata */
  tags?: Record<string, string>;
  /** Optional notes */
  notes?: string;
  /** Compress backup before encryption (default: true) */
  compress?: boolean;
  /** Verify backup after creation (default: true) */
  verify?: boolean;
}

/**
 * Options for restore operation
 */
export interface RestoreOptions {
  /** Target path to restore database (default: original location) */
  targetPath?: string;
  /** Apply sanitization rules during restore */
  sanitize?: boolean;
  /** Sanitization rules to apply */
  sanitizationRules?: SanitizationRules;
  /** Open database in read-only mode */
  readonly?: boolean;
  /** Overwrite existing database file */
  overwrite?: boolean;
  /** Target environment for restore */
  targetEnvironment?: Environment;
  /** Verify integrity after restore (default: true) */
  verify?: boolean;
}

/**
 * Backup operation result
 */
export interface BackupResult {
  success: boolean;
  metadata: BackupMetadata;
  duration: number; // milliseconds
  error?: string;
}

/**
 * Restore operation result
 */
export interface RestoreResult {
  success: boolean;
  backupId: string;
  targetPath: string;
  sanitized: boolean;
  duration: number; // milliseconds
  integrityCheck?: IntegrityResult;
  error?: string;
}

/**
 * Database integrity check result
 */
export interface IntegrityResult {
  ok: boolean;
  checks: {
    foreignKeys: boolean;
    quickCheck: boolean;
    integrityCheck: boolean;
  };
  errors: string[];
  warnings: string[];
}

/**
 * VACUUM operation result
 */
export interface VacuumResult {
  success: boolean;
  sizeBefore: number;
  sizeAfter: number;
  spaceReclaimed: number;
  duration: number; // milliseconds
  error?: string;
}

/**
 * Database repair operation result
 */
export interface RepairResult {
  success: boolean;
  repairStrategy: 'backup_restore' | 'litestream_restore' | 'reindex' | 'sqlite_recover' | 'recreate' | 'none';
  backupUsed?: string;
  integrityAfterRepair?: IntegrityResult;
  /** Number of rows recovered (for sqlite_recover strategy) */
  rowsRecovered?: number;
  /** Number of tables recovered (for sqlite_recover strategy) */
  tablesRecovered?: number;
  /** Path to backed up corrupted database file */
  corruptedBackupPath?: string;
  error?: string;
}

/**
 * Backup search criteria
 */
export interface BackupSearchCriteria {
  service?: string;
  environment?: Environment;
  startDate?: Date;
  endDate?: Date;
  sanitized?: boolean;
  tags?: Record<string, string>;
  limit?: number;
  offset?: number;
}

/**
 * S3 configuration
 */
export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional path prefix for all backups */
  prefix?: string;
}

/**
 * Encryption configuration
 */
export interface EncryptionConfig {
  /** Base64-encoded encryption key (32 bytes for AES-256) */
  key: string;
  /** Optional key rotation version identifier */
  keyVersion?: string;
}

/**
 * Litestream configuration for auto-repair
 * Enables restore from continuous WAL replication as a repair strategy
 */
export interface LitestreamRepairConfig {
  /** Whether Litestream repair strategy is enabled */
  enabled: boolean;
  /** Environment (production, staging, dev) */
  environment: string;
  /** Wasabi S3 configuration for Litestream replicas */
  wasabi: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
}

/**
 * Backup manager configuration
 */
export interface BackupManagerConfig {
  /** Service name */
  service: string;
  /** Database file path */
  dbPath: string;
  /** S3 configuration */
  s3: S3Config;
  /** Encryption configuration */
  encryption: EncryptionConfig;
  /** Current environment */
  environment?: Environment;
  /** Sanitization rules (optional) */
  sanitizationRules?: SanitizationRules;
  /** Retention policy in days (default: 30) */
  retentionDays?: number;
  /** Litestream configuration for auto-repair (optional) */
  litestream?: LitestreamRepairConfig;
}

/**
 * Backup catalog entry
 */
export interface BackupCatalogEntry {
  metadata: BackupMetadata;
  /** Whether backup is available (not expired/deleted) */
  available: boolean;
  /** S3 URL for direct access */
  url?: string;
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  /** Run foreign key check */
  checkForeignKeys?: boolean;
  /** Run quick_check pragma */
  quickCheck?: boolean;
  /** Run full integrity_check pragma */
  fullIntegrityCheck?: boolean;
}
