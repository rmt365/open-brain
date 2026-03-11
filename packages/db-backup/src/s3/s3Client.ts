/**
 * S3/Wasabi client wrapper for backup storage
 */

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { S3Config } from '../types.ts';
import { streamToUint8Array } from '../utils/stream.ts';

export class BackupS3Client {
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(config: S3Config) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true, // Required for Wasabi compatibility
    });

    this.bucket = config.bucket;
    this.prefix = config.prefix || 'backups';
  }

  /**
   * Generate S3 key for a backup file
   */
  generateKey(service: string, backupId: string, filename: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${this.prefix}/${service}/${year}/${month}/${day}/${backupId}/${filename}`;
  }

  /**
   * Upload a file to S3
   */
  async upload(key: string, data: Uint8Array, metadata?: Record<string, string>): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: data,
        Metadata: metadata,
        ServerSideEncryption: 'AES256', // S3 server-side encryption (in addition to our client-side encryption)
      },
    });

    await upload.done();
  }

  /**
   * Upload a readable stream to S3 (for large files)
   */
  async uploadStream(key: string, stream: ReadableStream<Uint8Array>, metadata?: Record<string, string>): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: stream,
        Metadata: metadata,
        ServerSideEncryption: 'AES256',
      },
    });

    await upload.done();
  }

  /**
   * Download a file from S3
   */
  async download(key: string): Promise<Uint8Array> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`No body in S3 response for key: ${key}`);
    }

    // Convert stream to Uint8Array using utility
    return await streamToUint8Array(response.Body.transformToWebStream());
  }

  /**
   * Get download stream for a file (memory efficient for large files)
   */
  async downloadStream(key: string): Promise<ReadableStream<Uint8Array>> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`No body in S3 response for key: ${key}`);
    }

    return response.Body.transformToWebStream();
  }

  /**
   * Check if a file exists in S3
   */
  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.client.send(command);
      return true;
    } catch (error) {
      if ((error as Error).name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata from S3
   */
  async getMetadata(key: string): Promise<Record<string, string>> {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);
    return response.Metadata || {};
  }

  /**
   * Delete a file from S3
   */
  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  /**
   * List backup files for a service
   */
  async listBackups(service: string, options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<{ key: string; size: number; lastModified: Date }[]> {
    const prefix = `${this.prefix}/${service}/`;

    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: options?.limit || 1000,
    });

    const response = await this.client.send(command);

    if (!response.Contents) {
      return [];
    }

    let backups = response.Contents
      .filter(obj => obj.Key && obj.Size && obj.LastModified)
      .map(obj => ({
        key: obj.Key!,
        size: obj.Size!,
        lastModified: obj.LastModified!,
      }));

    // Filter by date range if provided
    if (options?.startDate) {
      backups = backups.filter(b => b.lastModified >= options.startDate!);
    }
    if (options?.endDate) {
      backups = backups.filter(b => b.lastModified <= options.endDate!);
    }

    // Sort by most recent first
    backups.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

    return backups;
  }

  /**
   * Delete backups older than retention period
   */
  async deleteExpiredBackups(service: string, retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const backups = await this.listBackups(service, { endDate: cutoffDate });

    let deletedCount = 0;
    for (const backup of backups) {
      await this.delete(backup.key);
      deletedCount++;
    }

    return deletedCount;
  }
}
