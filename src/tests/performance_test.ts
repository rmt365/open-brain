import { assertEquals } from "@std/assert";
import { processInChunks } from "../logic/thoughts.ts";

// =============================================
// processInChunks: basic behavior
// =============================================

Deno.test("processInChunks: processes all items and counts successes", async () => {
  const items = [1, 2, 3, 4, 5];
  const result = await processInChunks(
    items,
    async (_item) => true,
    3
  );
  assertEquals(result.processed, 5);
  assertEquals(result.failed, 0);
});

Deno.test("processInChunks: counts failures when fn returns false", async () => {
  const items = [1, 2, 3, 4];
  const result = await processInChunks(
    items,
    async (item) => item % 2 === 0, // only evens succeed
    2
  );
  assertEquals(result.processed, 2); // items 2, 4
  assertEquals(result.failed, 2);    // items 1, 3
});

Deno.test("processInChunks: counts rejections as failures", async () => {
  const items = ["ok", "throw", "ok"];
  const result = await processInChunks(
    items,
    async (item) => {
      if (item === "throw") throw new Error("boom");
      return true;
    },
    3
  );
  assertEquals(result.processed, 2);
  assertEquals(result.failed, 1);
});

Deno.test("processInChunks: returns zero counts for empty array", async () => {
  const result = await processInChunks(
    [],
    async () => true,
    5
  );
  assertEquals(result.processed, 0);
  assertEquals(result.failed, 0);
});

// =============================================
// processInChunks: concurrency behavior
// =============================================

Deno.test("processInChunks: respects chunk size for concurrency", async () => {
  let maxConcurrent = 0;
  let currentConcurrent = 0;

  const items = [1, 2, 3, 4, 5, 6, 7];
  await processInChunks(
    items,
    async () => {
      currentConcurrent++;
      if (currentConcurrent > maxConcurrent) {
        maxConcurrent = currentConcurrent;
      }
      // Simulate async work
      await new Promise((r) => setTimeout(r, 10));
      currentConcurrent--;
      return true;
    },
    3
  );

  // Max concurrent should never exceed chunk size of 3
  assertEquals(maxConcurrent <= 3, true);
  // But it should have used concurrency (at least 2 ran at once)
  assertEquals(maxConcurrent >= 2, true);
});

Deno.test("processInChunks: one rejection in a chunk does not abort other chunks", async () => {
  // 6 items, concurrency 3 → 2 chunks
  // First chunk: items 0,1,2 — item 1 throws
  // Second chunk: items 3,4,5 — all succeed
  const items = [0, 1, 2, 3, 4, 5];
  const processed: number[] = [];

  const result = await processInChunks(
    items,
    async (item) => {
      if (item === 1) throw new Error("chunk 1 failure");
      processed.push(item);
      return true;
    },
    3
  );

  assertEquals(result.processed, 5);
  assertEquals(result.failed, 1);
  // Items from second chunk should still have been processed
  assertEquals(processed.includes(3), true);
  assertEquals(processed.includes(4), true);
  assertEquals(processed.includes(5), true);
});

Deno.test("processInChunks: handles single item", async () => {
  const result = await processInChunks(
    ["only"],
    async () => true,
    5
  );
  assertEquals(result.processed, 1);
  assertEquals(result.failed, 0);
});

Deno.test("processInChunks: concurrency=1 processes sequentially", async () => {
  const order: number[] = [];
  const items = [1, 2, 3];

  await processInChunks(
    items,
    async (item) => {
      order.push(item);
      return true;
    },
    1
  );

  assertEquals(order, [1, 2, 3]);
});
