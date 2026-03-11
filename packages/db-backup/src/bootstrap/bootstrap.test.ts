/**
 * Tests for bootstrap module
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createDegradedServer } from "./degraded-server.ts";

Deno.test("createDegradedServer - returns server handle with string config", () => {
  const server = createDegradedServer("test-service");

  assertExists(server.getApp);
  assertExists(server.close);

  const app = server.getApp();
  assertExists(app.fetch);
});

Deno.test("createDegradedServer - returns server handle with object config", () => {
  const server = createDegradedServer({
    service: "test-service",
    version: "2.0.0",
    reason: "test_reason",
  });

  assertExists(server.getApp);
  assertExists(server.close);
});

Deno.test("createDegradedServer - health endpoint returns 503", async () => {
  const server = createDegradedServer("test-service");
  const app = server.getApp();

  const req = new Request("http://localhost/health");
  const res = await app.fetch(req);

  assertEquals(res.status, 503);

  const body = await res.json();
  assertEquals(body.status, "degraded");
  assertEquals(body.service, "test-service");
  assertEquals(body.reason, "database_corruption");
  assertExists(body.timestamp);
});

Deno.test("createDegradedServer - manifest endpoint returns service info", async () => {
  const server = createDegradedServer({
    service: "my-service",
    version: "1.2.3",
  });
  const app = server.getApp();

  const req = new Request("http://localhost/manifest");
  const res = await app.fetch(req);

  assertEquals(res.status, 200);

  const body = await res.json();
  assertEquals(body.service, "my-service");
  assertEquals(body.version, "1.2.3");
  assertEquals(body.status, "degraded");
  assertEquals(body.tools, []);
});

Deno.test("createDegradedServer - other routes return 503", async () => {
  const server = createDegradedServer("test-service");
  const app = server.getApp();

  // Test various routes
  const routes = ["/api/test", "/feeds", "/users/123", "/"];

  for (const route of routes) {
    const req = new Request(`http://localhost${route}`);
    const res = await app.fetch(req);

    assertEquals(res.status, 503, `Route ${route} should return 503`);

    const body = await res.json();
    assertEquals(body.error, "Service Unavailable");
  }
});

Deno.test("createDegradedServer - close() is callable", () => {
  const server = createDegradedServer("test-service");

  // Should not throw
  server.close();
});
