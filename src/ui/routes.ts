// Open Brain - UI Routes
// Serves the PWA chat interface and static assets

import { Hono } from "@hono/hono";
import type { Context } from "@hono/hono";
import { dirname, fromFileUrl, join } from "@std/path";

export function createUIRoutes(basePath: string = ""): Hono {
  const router = new Hono();

  // GET /ui/brain -- renders standalone HTML page
  router.get("/brain", (c: Context) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#1e1b4b">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Open Brain</title>
  <link rel="manifest" href="${basePath}/ui/manifest.json">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0f0e1a; height: 100dvh; overflow: hidden; }
  </style>
</head>
<body>
  <open-brain-chat></open-brain-chat>
  <script>window.__BASE_PATH = '${basePath}';</script>
  <script type="module" src="${basePath}/ui/static/js/components/open-brain-chat.js"></script>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('${basePath}/ui/sw.js', { scope: '${basePath}/ui/' })
        .catch(function() {});
    }
  </script>
</body>
</html>`;
    return c.html(html);
  });

  // GET /ui/browse -- renders thought browser page
  router.get("/browse", (c: Context) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#1e1b4b">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Open Brain — Browse</title>
  <link rel="manifest" href="${basePath}/ui/manifest.json">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0f0e1a; height: 100dvh; overflow: hidden; }
  </style>
</head>
<body>
  <open-brain-browse></open-brain-browse>
  <script>window.__BASE_PATH = '${basePath}';</script>
  <script type="module" src="${basePath}/ui/static/js/components/open-brain-browse.js"></script>
</body>
</html>`;
    return c.html(html);
  });

  // GET /ui/manifest.json -- generated dynamically with base path
  router.get("/manifest.json", (_c: Context) => {
    const manifest = {
      name: "Open Brain",
      short_name: "Brain",
      description: "Personal knowledge management",
      start_url: `${basePath}/ui/brain`,
      scope: `${basePath}/`,
      display: "standalone",
      background_color: "#0f0e1a",
      theme_color: "#1e1b4b",
      icons: [
        {
          src: `${basePath}/ui/static/icons/brain-192.svg`,
          sizes: "192x192",
          type: "image/svg+xml",
        },
        {
          src: `${basePath}/ui/static/icons/brain-512.svg`,
          sizes: "512x512",
          type: "image/svg+xml",
        },
      ],
    };
    return new Response(JSON.stringify(manifest, null, 2), {
      headers: { "Content-Type": "application/manifest+json" },
    });
  });

  // GET /ui/sw.js
  router.get("/sw.js", async (_c: Context) => {
    const thisDir = dirname(fromFileUrl(import.meta.url));
    const content = await Deno.readTextFile(join(thisDir, "static", "sw.js"));
    return new Response(content, {
      headers: { "Content-Type": "application/javascript" },
    });
  });

  // GET /ui/static/* -- serves static files
  router.get("/static/*", async (c: Context) => {
    const path = decodeURIComponent(c.req.path);
    const staticPath = path.replace(/^\/?ui\/static\//, "").replace(
      /^\/static\//,
      "",
    );
    const thisDir = dirname(fromFileUrl(import.meta.url));
    const filePath = join(thisDir, "static", staticPath);

    try {
      const ext = filePath.split(".").pop()?.toLowerCase() || "";
      const contentTypes: Record<string, string> = {
        "js": "application/javascript",
        "css": "text/css",
        "json": "application/json",
        "png": "image/png",
        "svg": "image/svg+xml",
        "ico": "image/x-icon",
      };
      const contentType = contentTypes[ext] || "application/octet-stream";
      const isBinary = ["png", "jpg", "jpeg", "gif", "webp", "ico"].includes(
        ext,
      );

      if (isBinary) {
        const content = await Deno.readFile(filePath);
        return new Response(content, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=3600",
          },
        });
      } else {
        const content = await Deno.readTextFile(filePath);
        return new Response(content, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=3600",
          },
        });
      }
    } catch {
      return c.text("Not found", 404);
    }
  });

  return router;
}
