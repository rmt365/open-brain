import { assertEquals } from "jsr:@std/assert";
import { extractUrls } from "../logic/url-detection.ts";

Deno.test("extractUrls: finds https URL", () => {
  assertEquals(extractUrls("check https://example.com out"), ["https://example.com"]);
});

Deno.test("extractUrls: finds http URL", () => {
  assertEquals(extractUrls("see http://example.com"), ["http://example.com"]);
});

Deno.test("extractUrls: finds URL with path and query", () => {
  assertEquals(
    extractUrls("go to https://example.com/path?q=1&r=2#frag"),
    ["https://example.com/path?q=1&r=2#frag"]
  );
});

Deno.test("extractUrls: finds multiple URLs", () => {
  assertEquals(
    extractUrls("https://a.com and https://b.com/page"),
    ["https://a.com", "https://b.com/page"]
  );
});

Deno.test("extractUrls: strips trailing punctuation", () => {
  assertEquals(extractUrls("visit https://example.com."), ["https://example.com"]);
  assertEquals(extractUrls("visit https://example.com,"), ["https://example.com"]);
  assertEquals(extractUrls("(https://example.com)"), ["https://example.com"]);
});

Deno.test("extractUrls: handles URL with parentheses in path", () => {
  assertEquals(
    extractUrls("https://en.wikipedia.org/wiki/Foo_(bar)"),
    ["https://en.wikipedia.org/wiki/Foo_(bar)"]
  );
});

Deno.test("extractUrls: returns empty for no URLs", () => {
  assertEquals(extractUrls("just a regular thought"), []);
});

Deno.test("extractUrls: returns empty for empty string", () => {
  assertEquals(extractUrls(""), []);
});
