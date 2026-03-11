/**
 * Configuration validation utilities
 */

import type { S3Config, EncryptionConfig, BackupManagerConfig } from '../types.ts';

/**
 * Validate S3 configuration
 */
export function validateS3Config(config: S3Config): string[] {
  const errors: string[] = [];

  if (!config.endpoint?.trim()) {
    errors.push('S3 endpoint is required');
  }

  if (!config.region?.trim()) {
    errors.push('S3 region is required');
  }

  if (!config.bucket?.trim()) {
    errors.push('S3 bucket is required');
  }

  if (!config.accessKeyId?.trim()) {
    errors.push('S3 access key ID is required');
  }

  if (!config.secretAccessKey?.trim()) {
    errors.push('S3 secret access key is required');
  }

  return errors;
}

/**
 * Validate encryption configuration
 */
export function validateEncryptionConfig(config: EncryptionConfig): string[] {
  const errors: string[] = [];

  if (!config.key?.trim()) {
    errors.push('Encryption key is required');
  } else {
    try {
      const decoded = atob(config.key);
      if (decoded.length !== 32) {
        errors.push('Encryption key must be 32 bytes (256 bits) when base64 decoded');
      }
    } catch {
      errors.push('Encryption key must be valid base64');
    }
  }

  return errors;
}

/**
 * Validate full backup manager configuration
 */
export function validateBackupConfig(config: BackupManagerConfig): string[] {
  const errors: string[] = [];

  if (!config.service?.trim()) {
    errors.push('Service name is required');
  }

  if (!config.dbPath?.trim()) {
    errors.push('Database path is required');
  }

  errors.push(...validateS3Config(config.s3));
  errors.push(...validateEncryptionConfig(config.encryption));

  if (config.retentionDays !== undefined) {
    if (!Number.isInteger(config.retentionDays) || config.retentionDays < 1) {
      errors.push('Retention days must be a positive integer');
    }
  }

  return errors;
}

/**
 * Throw if configuration is invalid
 */
export function assertValidConfig(config: BackupManagerConfig): void {
  const errors = validateBackupConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid backup configuration:\n  - ${errors.join('\n  - ')}`);
  }
}
