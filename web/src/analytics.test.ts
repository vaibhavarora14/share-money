import { describe, expect, it } from "vitest";
import { findDestinationForPlatform } from "./analytics";

describe("SSR CTA destination resolution", () => {
  it("maps stamped SSR platforms to landing destinations", () => {
    expect(findDestinationForPlatform("android")?.platform).toBe("android");
    expect(findDestinationForPlatform("ios")?.platform).toBe("ios");
    expect(findDestinationForPlatform("web")?.platform).toBe("web");
  });

  it("rejects unknown or missing platforms", () => {
    expect(findDestinationForPlatform(undefined)).toBeNull();
    expect(findDestinationForPlatform(null)).toBeNull();
    expect(findDestinationForPlatform("desktop")).toBeNull();
    expect(findDestinationForPlatform("")).toBeNull();
  });
});
