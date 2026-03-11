/**
 * Encryption utilities for database backups
 * Uses AES-256-GCM for authenticated encryption
 */

import { crypto } from "std/crypto";
import type { EncryptionConfig } from '../types.ts';
import { compressData, decompressData } from '../utils/stream.ts';

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits recommended for GCM
const TAG_LENGTH = 128; // 128 bits for authentication tag

/**
 * Encryption result with IV and ciphertext
 */
export interface EncryptedData {
  /** Initialization vector (nonce) */
  iv: Uint8Array;
  /** Encrypted data with authentication tag */
  ciphertext: Uint8Array;
  /** Optional key version identifier */
  keyVersion?: string;
}

/**
 * Generate a new encryption key
 */
export async function generateEncryptionKey(): Promise<string> {
  const key = new Uint8Array(32); // 256 bits
  crypto.getRandomValues(key);
  return btoa(String.fromCharCode(...key));
}

/**
 * Import encryption key from base64 string
 */
async function importKey(keyB64: string): Promise<CryptoKey> {
  const keyData = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));

  if (keyData.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (256 bits)');
  }

  return await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data using AES-256-GCM
 */
export async function encrypt(
  data: Uint8Array,
  config: EncryptionConfig
): Promise<EncryptedData> {
  const key = await importKey(config.key);

  // Generate random IV
  const iv = new Uint8Array(IV_LENGTH);
  crypto.getRandomValues(iv);

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv,
      tagLength: TAG_LENGTH,
    },
    key,
    data.buffer as ArrayBuffer
  );

  return {
    iv,
    ciphertext: new Uint8Array(ciphertext),
    keyVersion: config.keyVersion,
  };
}

/**
 * Decrypt data using AES-256-GCM
 */
export async function decrypt(
  encrypted: EncryptedData,
  config: EncryptionConfig
): Promise<Uint8Array> {
  const key = await importKey(config.key);

  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: encrypted.iv.buffer as ArrayBuffer,
        tagLength: TAG_LENGTH,
      },
      key,
      encrypted.ciphertext.buffer as ArrayBuffer
    );

    return new Uint8Array(plaintext);
  } catch (error) {
    throw new Error(`Decryption failed: ${(error as Error).message}. This may indicate data corruption or wrong encryption key.`);
  }
}

/**
 * Serialize encrypted data to single byte array for storage
 * Format: [IV_LENGTH(1)][IV][CIPHERTEXT]
 */
export function serializeEncrypted(encrypted: EncryptedData): Uint8Array {
  const result = new Uint8Array(1 + encrypted.iv.length + encrypted.ciphertext.length);
  result[0] = encrypted.iv.length;
  result.set(encrypted.iv, 1);
  result.set(encrypted.ciphertext, 1 + encrypted.iv.length);
  return result;
}

/**
 * Deserialize encrypted data from byte array
 */
export function deserializeEncrypted(data: Uint8Array): EncryptedData {
  const ivLength = data[0];
  const iv = data.slice(1, 1 + ivLength);
  const ciphertext = data.slice(1 + ivLength);

  return { iv, ciphertext };
}

/**
 * Encrypt file data with optional compression
 */
export async function encryptFile(
  fileData: Uint8Array,
  config: EncryptionConfig,
  compress = true
): Promise<Uint8Array> {
  // Optional compression before encryption using utility
  const data = compress ? await compressData(fileData) : fileData;

  const encrypted = await encrypt(data, config);
  return serializeEncrypted(encrypted);
}

/**
 * Decrypt file data with optional decompression
 */
export async function decryptFile(
  encryptedData: Uint8Array,
  config: EncryptionConfig,
  decompress = true
): Promise<Uint8Array> {
  const encrypted = deserializeEncrypted(encryptedData);
  const data = await decrypt(encrypted, config);

  // Optional decompression after decryption using utility
  return decompress ? await decompressData(data) : data;
}

/**
 * Calculate SHA-256 hash of data
 */
export async function sha256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
