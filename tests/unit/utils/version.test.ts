import { describe, expect, it } from "vitest";

import {
  getUserAgent,
  SDK_NAME,
  SDK_PLATFORM,
  SDK_VERSION,
} from "@/utils/version";

describe("version utilities", () => {
  it("should export SDK_NAME constant", () => {
    expect(SDK_NAME).toBe("@opperai/agents");
  });

  it("should export SDK_PLATFORM constant", () => {
    expect(SDK_PLATFORM).toBe("ts");
  });

  it("should export SDK_VERSION from package.json", () => {
    expect(SDK_VERSION).toBeDefined();
    expect(typeof SDK_VERSION).toBe("string");
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+/); // Matches semver pattern
  });

  it("should generate correct User-Agent string with platform identifier", () => {
    const userAgent = getUserAgent();
    expect(userAgent).toBe(`${SDK_NAME}-${SDK_PLATFORM}/${SDK_VERSION}`);
    expect(userAgent).toMatch(/^@opperai\/agents-ts\/\d+\.\d+\.\d+/);
  });
});
