/**
 * Litestream integration module
 *
 * Provides continuous WAL replication to Wasabi S3 via Litestream.
 *
 * @module litestream
 */

// Configuration types and utilities
export {
  type WasabiConfig,
  type LitestreamConfig,
  type GenerationInfo,
  getLitestreamPath,
  generateLitestreamYaml,
  generateMultiDbLitestreamYaml,
  readWasabiConfigFromEnv,
  validateWasabiConfig,
} from "./config.ts";

// Restore utilities
export {
  type LitestreamRestoreOptions,
  type LitestreamRestoreResult,
  restoreFromLitestream,
  listGenerations,
  replicaExists,
  getLatestGeneration,
} from "./restore.ts";

// Health monitoring
export {
  type LitestreamHealthStatus,
  checkLitestreamHealth,
  isLitestreamHealthy,
  getLitestreamHealthSummary,
  formatLitestreamHealthResponse,
} from "./health.ts";
