/**
 * @p2b/db-backup - Database backup, restore, and health utilities
 *
 * Primary APIs:
 * - bootstrapService/readServiceEnv: Service startup with health checks
 * - BackupManager: Backup/restore operations
 * - Health monitoring: checkStartupHealth, DatabaseHealthScheduler
 */

// Bootstrap utilities (used by 8 services)
export {
  createDegradedServer,
  bootstrapService,
  readServiceEnv,
  type DegradedServerConfig,
  type DegradedServerHandle,
  type ServiceBootstrapConfig,
  type ServiceHandle,
  type ServiceEnvConfig,
  type BootstrapResult,
} from './bootstrap/index.ts';

// Backup manager (used by CRM, db-tools)
export { BackupManager } from './backupManager.ts';

// Health monitoring (used by Platform)
export {
  checkStartupHealth,
  type StartupHealthConfig,
  type StartupHealthResult,
} from './health/startup.ts';
export {
  DatabaseHealthScheduler,
  startHealthScheduler,
  type HealthSchedulerConfig,
  type HealthSchedulerHandle,
} from './health/scheduler.ts';

// Encryption (used by db-tools CLI)
export { generateEncryptionKey } from './encryption/crypto.ts';

// Types (includes LitestreamRepairConfig for BackupManager.autoRepair())
export type * from './types.ts';
