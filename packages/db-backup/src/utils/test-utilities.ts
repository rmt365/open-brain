/**
 * Test utilities independently
 * This file can be run to verify utility functions work correctly
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  streamToUint8Array,
  concatenateUint8Arrays,
  uint8ArrayToStream,
  compressData,
  decompressData,
} from './stream.ts';

import {
  validateS3Config,
  validateEncryptionConfig,
  validateBackupConfig,
  assertValidConfig,
} from './config.ts';

// ===== Stream Utilities Tests =====

Deno.test('streamToUint8Array - basic conversion', async () => {
  const data = new TextEncoder().encode('Hello, World!');
  const stream = uint8ArrayToStream(data);
  const result = await streamToUint8Array(stream);

  assertEquals(result.length, data.length);
  assertEquals(Array.from(result), Array.from(data));
});

Deno.test('concatenateUint8Arrays - multiple chunks', () => {
  const chunk1 = new Uint8Array([1, 2, 3]);
  const chunk2 = new Uint8Array([4, 5, 6]);
  const chunk3 = new Uint8Array([7, 8, 9]);

  const result = concatenateUint8Arrays([chunk1, chunk2, chunk3]);

  assertEquals(result.length, 9);
  assertEquals(Array.from(result), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

Deno.test('concatenateUint8Arrays - empty array', () => {
  const result = concatenateUint8Arrays([]);
  assertEquals(result.length, 0);
});

Deno.test('concatenateUint8Arrays - single chunk', () => {
  const chunk = new Uint8Array([1, 2, 3, 4, 5]);
  const result = concatenateUint8Arrays([chunk]);

  assertEquals(result.length, 5);
  assertEquals(Array.from(result), [1, 2, 3, 4, 5]);
});

Deno.test('uint8ArrayToStream - creates readable stream', async () => {
  const data = new Uint8Array([1, 2, 3, 4, 5]);
  const stream = uint8ArrayToStream(data);

  const reader = stream.getReader();
  const { value, done } = await reader.read();

  assert(!done);
  assertEquals(Array.from(value!), [1, 2, 3, 4, 5]);
});

Deno.test('compressData - reduces size for repetitive data', async () => {
  const repetitiveData = new TextEncoder().encode('A'.repeat(1000));
  const compressed = await compressData(repetitiveData);

  assert(compressed.length < repetitiveData.length, 'Compressed data should be smaller');
});

Deno.test('compressData and decompressData - round trip', async () => {
  const originalData = new TextEncoder().encode('Hello, World! This is a test message.');
  const compressed = await compressData(originalData);
  const decompressed = await decompressData(compressed);

  assertEquals(Array.from(decompressed), Array.from(originalData));
});

Deno.test('decompressData - handles large data', async () => {
  const largeData = new TextEncoder().encode('X'.repeat(10000));
  const compressed = await compressData(largeData);
  const decompressed = await decompressData(compressed);

  assertEquals(decompressed.length, largeData.length);
  assertEquals(Array.from(decompressed), Array.from(largeData));
});

// ===== Config Validation Tests =====

Deno.test('validateS3Config - valid config returns no errors', () => {
  const config = {
    endpoint: 'https://s3.wasabisys.com',
    region: 'us-east-1',
    bucket: 'test-bucket',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
  };

  const errors = validateS3Config(config);
  assertEquals(errors.length, 0);
});

Deno.test('validateS3Config - missing endpoint', () => {
  const config = {
    endpoint: '',
    region: 'us-east-1',
    bucket: 'test-bucket',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
  };

  const errors = validateS3Config(config);
  assert(errors.length > 0);
  assert(errors.some(e => e.includes('endpoint')));
});

Deno.test('validateS3Config - all fields missing', () => {
  const config = {
    endpoint: '',
    region: '',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
  };

  const errors = validateS3Config(config);
  assertEquals(errors.length, 5); // All 5 fields should have errors
});

Deno.test('validateEncryptionConfig - valid base64 32-byte key', () => {
  // Generate valid 32-byte key in base64
  const keyBytes = new Uint8Array(32);
  crypto.getRandomValues(keyBytes);
  const key = btoa(String.fromCharCode(...keyBytes));

  const errors = validateEncryptionConfig({ key });
  assertEquals(errors.length, 0);
});

Deno.test('validateEncryptionConfig - key too short', () => {
  const shortKey = btoa('too-short');
  const errors = validateEncryptionConfig({ key: shortKey });

  assert(errors.length > 0);
  assert(errors.some(e => e.includes('32 bytes')));
});

Deno.test('validateEncryptionConfig - invalid base64', () => {
  const errors = validateEncryptionConfig({ key: 'not-valid-base64!!!' });

  assert(errors.length > 0);
  assert(errors.some(e => e.includes('valid base64')));
});

Deno.test('validateEncryptionConfig - empty key', () => {
  const errors = validateEncryptionConfig({ key: '' });

  assert(errors.length > 0);
  assert(errors.some(e => e.includes('required')));
});

Deno.test('validateBackupConfig - valid complete config', () => {
  const keyBytes = new Uint8Array(32);
  crypto.getRandomValues(keyBytes);
  const key = btoa(String.fromCharCode(...keyBytes));

  const config = {
    service: 'test-service',
    dbPath: '/path/to/db.db',
    s3: {
      endpoint: 'https://s3.wasabisys.com',
      region: 'us-east-1',
      bucket: 'test-bucket',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    },
    encryption: { key },
    environment: 'dev' as const,
    retentionDays: 30,
  };

  const errors = validateBackupConfig(config);
  assertEquals(errors.length, 0);
});

Deno.test('validateBackupConfig - invalid retention days', () => {
  const keyBytes = new Uint8Array(32);
  crypto.getRandomValues(keyBytes);
  const key = btoa(String.fromCharCode(...keyBytes));

  const config = {
    service: 'test-service',
    dbPath: '/path/to/db.db',
    s3: {
      endpoint: 'https://s3.wasabisys.com',
      region: 'us-east-1',
      bucket: 'test-bucket',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    },
    encryption: { key },
    retentionDays: -5,
  };

  const errors = validateBackupConfig(config);
  assert(errors.length > 0);
  assert(errors.some(e => e.includes('Retention days')));
});

Deno.test('validateBackupConfig - accumulates all errors', () => {
  const config = {
    service: '',
    dbPath: '',
    s3: {
      endpoint: '',
      region: '',
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
    },
    encryption: { key: '' },
    retentionDays: 0,
  };

  const errors = validateBackupConfig(config);
  assert(errors.length > 5, 'Should have multiple validation errors');
});

Deno.test('assertValidConfig - throws on invalid config', () => {
  const config = {
    service: '',
    dbPath: '',
    s3: {
      endpoint: '',
      region: '',
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
    },
    encryption: { key: '' },
  };

  let threwError = false;
  try {
    assertValidConfig(config);
  } catch (error) {
    threwError = true;
    assert((error as Error).message.includes('Invalid backup configuration'));
  }

  assert(threwError, 'Should have thrown an error');
});

Deno.test('assertValidConfig - does not throw on valid config', () => {
  const keyBytes = new Uint8Array(32);
  crypto.getRandomValues(keyBytes);
  const key = btoa(String.fromCharCode(...keyBytes));

  const config = {
    service: 'test-service',
    dbPath: '/path/to/db.db',
    s3: {
      endpoint: 'https://s3.wasabisys.com',
      region: 'us-east-1',
      bucket: 'test-bucket',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    },
    encryption: { key },
  };

  // Should not throw
  assertValidConfig(config);
});

console.log('✅ All utility tests defined');
