// Main exports for @p2b/db-core package

export { BaseDatabaseManager, findDbFile, checkDirectoryPermissions } from "./databaseManager.ts";
export { MigrationManager } from "./migrations.ts";
export { addColumnIfNotExists } from "./dbUtils.ts";
export type {
  Migration,
  MigrationStatus,
  QueryResult,
  DatabaseConfig,
  DatabaseManagerOptions,
  DbSearchOptions,
} from "./types.ts";
