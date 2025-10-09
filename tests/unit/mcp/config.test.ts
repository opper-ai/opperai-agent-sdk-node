import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { MCPconfig } from "@/mcp/config";

describe("MCPconfig", () => {
  it("creates stdio configuration with defaults", () => {
    const config = MCPconfig({
      name: "filesystem",
      transport: "stdio",
      command: "node",
      args: ["--version"],
    });

    expect(config).toMatchObject({
      name: "filesystem",
      transport: "stdio",
      command: "node",
      args: ["--version"],
      env: {},
      timeout: 30,
    });
  });

  it("requires stdio command", () => {
    let thrown: unknown;
    try {
      MCPconfig({
        name: "missing",
        transport: "stdio",
      } as never);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ZodError);
    const issues = (thrown as ZodError).flatten().fieldErrors;
    expect(issues["command"]).toBeDefined();
  });

  it("requires valid http-sse url", () => {
    expect(() =>
      MCPconfig({
        name: "remote",
        transport: "http-sse",
        url: "ftp://invalid",
      }),
    ).toThrow(/url must start with http/);
  });

  it("accepts valid http-sse configuration", () => {
    const config = MCPconfig({
      name: "search",
      transport: "http-sse",
      url: "https://example.com/mcp",
      headers: {
        Authorization: "Bearer token",
      },
    });

    expect(config).toMatchObject({
      name: "search",
      transport: "http-sse",
      url: "https://example.com/mcp",
      headers: {
        Authorization: "Bearer token",
      },
      method: "GET",
    });
  });

  it("accepts streamable-http configuration", () => {
    const config = MCPconfig({
      name: "composio",
      transport: "streamable-http",
      url: "https://example.com/mcp-stream",
      sessionId: "abc123",
    });

    expect(config).toMatchObject({
      name: "composio",
      transport: "streamable-http",
      url: "https://example.com/mcp-stream",
      headers: {},
      sessionId: "abc123",
    });
  });
});
