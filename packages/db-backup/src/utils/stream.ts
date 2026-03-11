/**
 * Stream utility functions
 * Centralizes common stream operations to eliminate code duplication
 */

/**
 * Convert a ReadableStream to Uint8Array
 * Replaces duplicate chunk concatenation code in S3 and crypto modules
 */
export async function streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return concatenateUint8Arrays(chunks);
}

/**
 * Concatenate multiple Uint8Array chunks into a single array
 */
export function concatenateUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Create a ReadableStream from Uint8Array
 */
export function uint8ArrayToStream(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

/**
 * Compress data using gzip
 */
export async function compressData(data: Uint8Array): Promise<Uint8Array> {
  const stream = uint8ArrayToStream(data);
  // Type assertion needed for CompressionStream compatibility
  const compressed = stream.pipeThrough(
    new CompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>
  );
  return await streamToUint8Array(compressed);
}

/**
 * Decompress gzip data
 */
export async function decompressData(data: Uint8Array): Promise<Uint8Array> {
  const stream = uint8ArrayToStream(data);
  // Type assertion needed for DecompressionStream compatibility
  const decompressed = stream.pipeThrough(
    new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>
  );
  return await streamToUint8Array(decompressed);
}
