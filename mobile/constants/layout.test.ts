import { assertEquals } from "jsr:@std/assert@1";
import { isDesktopWebViewport } from "./layout.ts";

Deno.test("notification side panel starts at the desktop breakpoint", () => {
  assertEquals(isDesktopWebViewport("web", 768), false);
  assertEquals(isDesktopWebViewport("web", 1023), false);
  assertEquals(isDesktopWebViewport("web", 1024), true);
  assertEquals(isDesktopWebViewport("ios", 1366), false);
});
