/**
 * Backup catalog for discovering and managing backups
 */

import type { BackupMetadata, BackupSearchCriteria, BackupCatalogEntry } from '../types.ts';
import { BackupS3Client } from '../s3/s3Client.ts';

export class BackupCatalog {
  constructor(private s3Client: BackupS3Client) {}

  /**
   * List all backups for a service
   */
  async listBackups(
    service: string,
    criteria?: BackupSearchCriteria
  ): Promise<BackupCatalogEntry[]> {
    const s3Backups = await this.s3Client.listBackups(service, {
      startDate: criteria?.startDate,
      endDate: criteria?.endDate,
      limit: criteria?.limit,
    });

    const entries: BackupCatalogEntry[] = [];

    for (const s3Backup of s3Backups) {
      // Each backup has a metadata.json file alongside the encrypted backup
      const metadataKey = s3Backup.key.replace('.db.encrypted', '.metadata.json');

      try {
        const metadataData = await this.s3Client.download(metadataKey);
        const metadataJson = new TextDecoder().decode(metadataData);
        const metadata: BackupMetadata = JSON.parse(metadataJson);

        // Apply filters
        if (criteria?.environment && metadata.environment !== criteria.environment) {
          continue;
        }
        if (criteria?.sanitized !== undefined && metadata.sanitized !== criteria.sanitized) {
          continue;
        }
        if (criteria?.tags) {
          const hasAllTags = Object.entries(criteria.tags).every(
            ([key, value]) => metadata.tags?.[key] === value
          );
          if (!hasAllTags) continue;
        }

        entries.push({
          metadata,
          available: true,
          url: s3Backup.key,
        });
      } catch (error) {
        // Metadata file missing or corrupted, skip this backup
        console.warn(`Failed to load metadata for ${s3Backup.key}:`, (error as Error).message);
      }
    }

    // Apply offset if specified
    const offset = criteria?.offset || 0;
    return entries.slice(offset);
  }

  /**
   * Get metadata for a specific backup
   */
  async getBackupMetadata(backupId: string, service: string): Promise<BackupMetadata | null> {
    const backups = await this.listBackups(service);
    const backup = backups.find(b => b.metadata.id === backupId);
    return backup?.metadata || null;
  }

  /**
   * Find the most recent successful backup
   */
  async findLatestBackup(
    service: string,
    criteria?: { environment?: string; sanitized?: boolean }
  ): Promise<BackupMetadata | null> {
    const backups = await this.listBackups(service, {
      environment: criteria?.environment as any,
      sanitized: criteria?.sanitized,
      limit: 1,
    });

    return backups[0]?.metadata || null;
  }

  /**
   * Find last known good backup (verified integrity)
   */
  async findLastGoodBackup(
    service: string,
    beforeDate?: Date
  ): Promise<BackupMetadata | null> {
    const backups = await this.listBackups(service, {
      endDate: beforeDate,
      limit: 100,
    });

    // Look for backups that were verified successfully
    for (const backup of backups) {
      if (backup.metadata.tags?.verified === 'true') {
        return backup.metadata;
      }
    }

    // If no verified backup found, return most recent
    return backups[0]?.metadata || null;
  }

  /**
   * Save backup metadata to S3
   */
  async saveMetadata(metadata: BackupMetadata): Promise<void> {
    const metadataJson = JSON.stringify(metadata, null, 2);
    const metadataData = new TextEncoder().encode(metadataJson);

    const metadataKey = metadata.key.replace('.db.encrypted', '.metadata.json');
    await this.s3Client.upload(metadataKey, metadataData);
  }

  /**
   * Delete a backup and its metadata
   */
  async deleteBackup(backupId: string, service: string): Promise<void> {
    const metadata = await this.getBackupMetadata(backupId, service);
    if (!metadata) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    // Delete encrypted backup file
    await this.s3Client.delete(metadata.key);

    // Delete metadata file
    const metadataKey = metadata.key.replace('.db.encrypted', '.metadata.json');
    await this.s3Client.delete(metadataKey);
  }
}
