/**
 * Main BackupManager class - integrates all backup functionality
 */

import { crypto } from 'std/crypto';
import { exists } from 'std/fs';
import { dirname } from 'std/path';
import type {
  BackupManagerConfig,
  BackupOptions,
  BackupResult,
  RestoreOptions,
  RestoreResult,
  BackupMetadata,
  IntegrityResult,
  VacuumResult,
  RepairResult,
  Environment,
} from './types.ts';
import { BackupS3Client } from './s3/s3Client.ts';
import { BackupCatalog } from './backup/catalog.ts';
import { encryptFile, decryptFile, sha256 } from './encryption/crypto.ts';
import { backupToMemory, restoreFromMemory, getDatabaseSize, getSQLiteVersion } from './backup/sqliteBackup.ts';
import { DatabaseSanitizer } from './sanitization/sanitizer.ts';
import { checkIntegrity } from './health/integrity.ts';
import { vacuum, shouldVacuum } from './health/vacuum.ts';
import { autoRepair, type LitestreamRepairConfig as RepairLitestreamConfig } from './health/repair.ts';
import { assertValidConfig } from './utils/config.ts';
import { Database } from 'sqlite3';

export class BackupManager {
  private s3Client: BackupS3Client;
  private catalog: BackupCatalog;
  private config: BackupManagerConfig;

  constructor(config: BackupManagerConfig) {
    // Validate configuration on construction
    assertValidConfig(config);

    this.config = config;
    this.s3Client = new BackupS3Client(config.s3);
    this.catalog = new BackupCatalog(this.s3Client);
  }

  /**
   * Create a backup of the database
   */
  async backup(options?: BackupOptions): Promise<BackupResult> {
    const startTime = Date.now();

    try {
      console.log(`Creating backup for ${this.config.service}...`);

      // Verify source database exists
      if (!await exists(this.config.dbPath)) {
        throw new Error(`Database not found: ${this.config.dbPath}`);
      }

      // Generate backup ID
      const backupId = crypto.randomUUID();

      // Read database file to memory
      console.log('Reading database file...');
      const dbData = await backupToMemory(this.config.dbPath);

      // Calculate original hash
      const originalHash = await sha256(dbData);
      const originalSize = dbData.length;

      // Encrypt and compress
      console.log('Encrypting backup...');
      const encryptedData = await encryptFile(
        dbData,
        this.config.encryption,
        options?.compress !== false
      );

      // Calculate backup hash
      const backupHash = await sha256(encryptedData);
      const backupSize = encryptedData.length;

      // Generate S3 key
      const key = this.s3Client.generateKey(
        this.config.service,
        backupId,
        'backup.db.encrypted'
      );

      // Upload to S3
      console.log('Uploading to S3...');
      await this.s3Client.upload(key, encryptedData, {
        service: this.config.service,
        environment: options?.environment || this.config.environment || 'dev',
        backupId,
      });

      // Create metadata
      const metadata: BackupMetadata = {
        id: backupId,
        service: this.config.service,
        environment: options?.environment || this.config.environment || 'dev',
        timestamp: new Date(),
        originalSize,
        backupSize,
        originalHash,
        backupHash,
        sqliteVersion: getSQLiteVersion(this.config.dbPath),
        sanitized: false,
        encryptionAlgorithm: 'AES-256-GCM',
        bucket: this.config.s3.bucket,
        key,
        tags: options?.tags,
        notes: options?.notes,
      };

      // Save metadata
      await this.catalog.saveMetadata(metadata);

      // Verify backup if requested
      if (options?.verify !== false) {
        console.log('Verifying backup...');
        const verified = await this.verifyBackup(backupId);
        if (!verified) {
          throw new Error('Backup verification failed');
        }
        metadata.tags = { ...metadata.tags, verified: 'true' };
        await this.catalog.saveMetadata(metadata);
      }

      const duration = Date.now() - startTime;
      console.log(`Backup completed in ${duration}ms (${backupSize} bytes)`);

      return {
        success: true,
        metadata,
        duration,
      };
    } catch (error) {
      return {
        success: false,
        metadata: {} as BackupMetadata,
        duration: Date.now() - startTime,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Restore a backup
   */
  async restore(backupId: string, options?: RestoreOptions): Promise<RestoreResult> {
    const startTime = Date.now();

    try {
      console.log(`Restoring backup ${backupId}...`);

      // Validate environment safety
      this.validateRestoreEnvironment(options?.targetEnvironment);

      // Get backup metadata
      const metadata = await this.catalog.getBackupMetadata(backupId, this.config.service);
      if (!metadata) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      // Determine target path
      const targetPath = options?.targetPath || this.config.dbPath;

      // Check if target exists
      if (await exists(targetPath) && !options?.overwrite) {
        throw new Error(
          `Target database already exists: ${targetPath}. Use overwrite=true to replace.`
        );
      }

      // Warn if pulling production data without sanitization
      if (metadata.environment === 'production' && !options?.sanitize && !metadata.sanitized) {
        console.warn('⚠️  Restoring production data without sanitization!');
      }

      // Download encrypted backup
      console.log('Downloading backup from S3...');
      const encryptedData = await this.s3Client.download(metadata.key);

      // Verify backup hash
      const downloadedHash = await sha256(encryptedData);
      if (downloadedHash !== metadata.backupHash) {
        throw new Error('Backup file corrupted - hash mismatch');
      }

      // Decrypt
      console.log('Decrypting backup...');
      const dbData = await decryptFile(
        encryptedData,
        this.config.encryption,
        true // decompress
      );

      // Verify original hash
      const originalHash = await sha256(dbData);
      if (originalHash !== metadata.originalHash) {
        throw new Error('Decrypted data corrupted - hash mismatch');
      }

      // Create temp file for sanitization if needed
      let finalData = dbData;
      let wasSanitized = false;

      if (options?.sanitize && options?.sanitizationRules) {
        console.log('Sanitizing database...');

        // Write to temp file
        const tempPath = await Deno.makeTempFile({ suffix: '.db' });
        await Deno.writeFile(tempPath, dbData);

        // Sanitize
        const db = new Database(tempPath);
        const sanitizer = new DatabaseSanitizer(db);
        await sanitizer.sanitize(options.sanitizationRules);
        db.close();

        // Read sanitized data
        finalData = await Deno.readFile(tempPath);
        await Deno.remove(tempPath);
        wasSanitized = true;
      }

      // Restore to target path
      console.log(`Restoring to ${targetPath}...`);
      await restoreFromMemory(finalData, targetPath, options?.overwrite);

      // Set read-only if requested
      if (options?.readonly) {
        const fileInfo = await Deno.stat(targetPath);
        await Deno.chmod(targetPath, 0o444); // Read-only
      }

      // Verify integrity if requested
      let integrityCheck: IntegrityResult | undefined;
      if (options?.verify !== false) {
        console.log('Verifying restored database...');
        integrityCheck = checkIntegrity(targetPath);
        if (!integrityCheck.ok) {
          throw new Error(`Restored database failed integrity check: ${integrityCheck.errors.join(', ')}`);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`Restore completed in ${duration}ms`);

      return {
        success: true,
        backupId,
        targetPath,
        sanitized: wasSanitized,
        duration,
        integrityCheck,
      };
    } catch (error) {
      return {
        success: false,
        backupId,
        targetPath: options?.targetPath || this.config.dbPath,
        sanitized: false,
        duration: Date.now() - startTime,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Verify a backup can be restored successfully
   */
  async verifyBackup(backupId: string): Promise<boolean> {
    try {
      const tempPath = await Deno.makeTempFile({ suffix: '.db' });

      try {
        const result = await this.restore(backupId, {
          targetPath: tempPath,
          overwrite: true,
          verify: true,
        });

        return result.success && result.integrityCheck?.ok === true;
      } finally {
        await Deno.remove(tempPath);
      }
    } catch (error) {
      console.error('Backup verification failed:', error);
      return false;
    }
  }

  /**
   * Run integrity check on database
   */
  integrityCheck(): IntegrityResult {
    return checkIntegrity(this.config.dbPath, {
      checkForeignKeys: true,
      quickCheck: true,
      fullIntegrityCheck: true,
    });
  }

  /**
   * Run VACUUM on database
   */
  async vacuum(): Promise<VacuumResult> {
    return await vacuum(this.config.dbPath);
  }

  /**
   * Auto-repair corrupted database
   */
  async autoRepair(): Promise<RepairResult> {
    // Build Litestream config for repair if configured
    let litestreamConfig: RepairLitestreamConfig | undefined;
    if (this.config.litestream?.enabled) {
      litestreamConfig = {
        enabled: true,
        service: this.config.service,
        environment: this.config.litestream.environment,
        wasabi: this.config.litestream.wasabi,
      };
    }

    const result = await autoRepair(
      this.config.dbPath,
      this.catalog,
      this.config.service,
      litestreamConfig
    );

    // If repair strategy is backup_restore, perform the restore
    if (result.success && result.repairStrategy === 'backup_restore' && result.backupUsed) {
      console.log(`Restoring from backup: ${result.backupUsed}`);

      // Backup current corrupted database
      const corruptedBackupPath = `${this.config.dbPath}.corrupted.${Date.now()}`;
      await Deno.copyFile(this.config.dbPath, corruptedBackupPath);
      console.log(`Corrupted database saved to: ${corruptedBackupPath}`);

      // Restore from good backup
      const restoreResult = await this.restore(result.backupUsed, {
        overwrite: true,
        verify: true,
      });

      if (!restoreResult.success) {
        throw new Error(`Failed to restore from backup: ${restoreResult.error}`);
      }

      result.integrityAfterRepair = restoreResult.integrityCheck;
    }

    return result;
  }

  /**
   * List available backups
   */
  async listBackups(options?: {
    environment?: Environment;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }) {
    return await this.catalog.listBackups(this.config.service, options);
  }

  /**
   * Find latest backup
   */
  async findLatestBackup(options?: { environment?: string; sanitized?: boolean }) {
    return await this.catalog.findLatestBackup(this.config.service, options);
  }

  /**
   * Delete old backups based on retention policy
   */
  async cleanupOldBackups(): Promise<number> {
    const retentionDays = this.config.retentionDays || 30;
    return await this.s3Client.deleteExpiredBackups(this.config.service, retentionDays);
  }

  /**
   * Check if VACUUM would be beneficial
   */
  async shouldVacuum(): Promise<boolean> {
    return await shouldVacuum(this.config.dbPath);
  }

  /**
   * Validate restore environment for safety
   */
  private validateRestoreEnvironment(targetEnvironment?: Environment): void {
    const currentEnv = Deno.env.get('ENVIRONMENT') || 'dev';

    // NEVER allow production to be overwritten
    if (currentEnv === 'production') {
      throw new Error('Cannot restore backups in production environment');
    }
  }
}
