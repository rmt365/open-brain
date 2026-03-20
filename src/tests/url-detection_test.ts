import { assertEquals } from "@std/assert";
import { extractUrls, isUrlOnlyMessage } from "../logic/url-detection.ts";

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

Deno.test("extractUrls: finds bare domain with path", () => {
  assertEquals(
    extractUrls("check twinflamesstudios.com/trust-business-audiobooks"),
    ["https://twinflamesstudios.com/trust-business-audiobooks"]
  );
});

Deno.test("extractUrls: finds bare domain without path", () => {
  assertEquals(extractUrls("visit example.com"), ["https://example.com"]);
});

Deno.test("extractUrls: finds bare .io domain", () => {
  assertEquals(extractUrls("see deno.io/docs"), ["https://deno.io/docs"]);
});

Deno.test("extractUrls: finds bare .co.uk domain", () => {
  assertEquals(extractUrls("check bbc.co.uk/news"), ["https://bbc.co.uk/news"]);
});

Deno.test("extractUrls: does not double-match explicit URL as bare domain", () => {
  assertEquals(
    extractUrls("https://example.com/page"),
    ["https://example.com/page"]
  );
});

Deno.test("extractUrls: does not match common words as domains", () => {
  assertEquals(extractUrls("I like this.thing a lot"), []);
});

Deno.test("extractUrls: finds both explicit and bare URLs", () => {
  const result = extractUrls("see https://a.com and b.com/page");
  assertEquals(result, ["https://a.com", "https://b.com/page"]);
});

Deno.test("isUrlOnlyMessage: bare URL is URL-only", () => {
  assertEquals(isUrlOnlyMessage("https://example.com", ["https://example.com"]), true);
});

Deno.test("isUrlOnlyMessage: bare domain is URL-only", () => {
  assertEquals(
    isUrlOnlyMessage("twinflamesstudios.com/path", ["https://twinflamesstudios.com/path"]),
    true
  );
});

Deno.test("isUrlOnlyMessage: 'save URL' is URL-only", () => {
  assertEquals(isUrlOnlyMessage("save https://example.com", ["https://example.com"]), true);
});

Deno.test("isUrlOnlyMessage: 'Log this URL:' is URL-only", () => {
  assertEquals(
    isUrlOnlyMessage("Log this URL: https://example.com", ["https://example.com"]),
    true
  );
});

Deno.test("isUrlOnlyMessage: 'bookmark this' is URL-only", () => {
  assertEquals(
    isUrlOnlyMessage("bookmark this https://example.com", ["https://example.com"]),
    true
  );
});

Deno.test("isUrlOnlyMessage: short context is URL-only", () => {
  assertEquals(
    isUrlOnlyMessage("this is interesting https://example.com", ["https://example.com"]),
    true
  );
});

Deno.test("isUrlOnlyMessage: long context is URL-mentioned", () => {
  assertEquals(
    isUrlOnlyMessage(
      "I found this article about machine learning https://example.com",
      ["https://example.com"]
    ),
    false
  );
});

Deno.test("isUrlOnlyMessage: thought with URL in the middle is URL-mentioned", () => {
  assertEquals(
    isUrlOnlyMessage(
      "I was reading https://example.com/article and it made me think about pricing",
      ["https://example.com/article"]
    ),
    false
  );
});

Deno.test("isUrlOnlyMessage: no URLs returns false", () => {
  assertEquals(isUrlOnlyMessage("", []), false);
});
