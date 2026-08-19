import { assertEquals } from "jsr:@std/assert@1";
import {
  isAuthDesktopWebViewport,
  isDesktopWebViewport,
} from "./layout.ts";

Deno.test("notification side panel starts at the desktop breakpoint", () => {
  assertEquals(isDesktopWebViewport("web", 768), false);
  assertEquals(isDesktopWebViewport("web", 1023), false);
  assertEquals(isDesktopWebViewport("web", 1024), true);
  assertEquals(isDesktopWebViewport("ios", 1366), false);
});

Deno.test("auth uses its full-width desktop frame at the two-pane breakpoint", () => {
  assertEquals(isAuthDesktopWebViewport("web", 959), false);
  assertEquals(isAuthDesktopWebViewport("web", 960), true);
  assertEquals(isAuthDesktopWebViewport("web", 1280), true);
  assertEquals(isAuthDesktopWebViewport("android", 1280), false);
});
