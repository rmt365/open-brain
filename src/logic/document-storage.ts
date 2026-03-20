// Open Brain - Document Storage Client
// Thin wrapper around S3 for storing document originals in Wasabi

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { WasabiConfig } from "../config.ts";

export class DocumentStorage {
  private client: S3Client;
  private bucket: string;
  private instanceName: string;

  constructor(config: WasabiConfig, instanceName: string) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
    this.bucket = config.bucket;
    this.instanceName = instanceName;
  }

  /**
   * Upload a document to Wasabi.
   * Key structure: {instance}/documents/{year}/{month}/{thoughtId}/{filename}
   */
  async upload(
    thoughtId: string,
    filename: string,
    data: Uint8Array,
    contentType: string
  ): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const key = `${this.instanceName}/documents/${year}/${month}/${thoughtId}/${filename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
    });

    await this.client.send(command);
    console.log(`[OpenBrain:DocStorage] Uploaded ${key} (${data.length} bytes)`);
    return key;
  }

  /**
   * Download a document from Wasabi.
   * Returns the S3 object body as a web ReadableStream with content metadata.
   */
  async download(key: string): Promise<{
    stream: ReadableStream<Uint8Array>;
    contentType: string;
    contentLength: number;
  }> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`Empty response body for key: ${key}`);
    }

    // The SDK returns a web ReadableStream in Deno
    const stream = response.Body as unknown as ReadableStream<Uint8Array>;

    return {
      stream,
      contentType: response.ContentType || "application/octet-stream",
      contentLength: response.ContentLength || 0,
    };
  }

  /** Delete a document from Wasabi. */
  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
    console.log(`[OpenBrain:DocStorage] Deleted ${key}`);
  }

  /** Construct a reference URL for a stored document. */
  getUrl(key: string): string {
    return `wasabi://${this.bucket}/${key}`;
  }
}
