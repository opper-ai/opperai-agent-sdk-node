import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { MCPClient } from "@/mcp/client";
import { MCPconfig } from "@/mcp/config";

const connectMock = vi.fn();
const closeMock = vi.fn();
const listToolsMock = vi.fn();
const callToolMock = vi.fn();

const streamableTransportMock = vi.hoisted(() => vi.fn());

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
  const Client = vi.fn().mockImplementation(() => ({
    connect: connectMock,
    close: closeMock,
    listTools: listToolsMock,
    callTool: callToolMock,
  }));

  return {
    __esModule: true,
    Client,
  };
});

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  __esModule: true,
  StreamableHTTPClientTransport: streamableTransportMock,
}));

describe("MCPClient streamable HTTP", () => {
  beforeEach(() => {
    streamableTransportMock.mockClear();
    streamableTransportMock.mockImplementation(() => ({
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
    }));
    connectMock.mockClear();
    closeMock.mockClear();
    listToolsMock.mockClear();
    callToolMock.mockClear();
    connectMock.mockResolvedValue(undefined);
    closeMock.mockResolvedValue(undefined);
    listToolsMock.mockResolvedValue({ tools: [] });
    callToolMock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates streamable transport with headers", async () => {
    const config = MCPconfig({
      name: "composio",
      transport: "streamable-http",
      url: "https://mcp.example.com",
      headers: {
        Authorization: "Bearer token",
      },
    });

    const client = MCPClient.fromConfig(config);
    await client.connect();

    expect(streamableTransportMock).toHaveBeenCalledTimes(1);
    const call = streamableTransportMock.mock.calls[0]!;
    const urlArg = call[0] as URL;
    const optionsArg = call[1] as { requestInit?: RequestInit };
    expect(urlArg).toBeInstanceOf(URL);
    expect(urlArg.toString()).toBe("https://mcp.example.com/");
    expect(optionsArg.requestInit?.headers).toEqual({
      Authorization: "Bearer token",
    });

    await client.disconnect();
  });

  it("passes sessionId when provided", async () => {
    const config = MCPconfig({
      name: "composio",
      transport: "streamable-http",
      url: "https://mcp.example.com",
      sessionId: "session-123",
    });

    const client = MCPClient.fromConfig(config);
    await client.connect();

    expect(streamableTransportMock).toHaveBeenCalledTimes(1);
    const call = streamableTransportMock.mock.calls[0]!;
    const optionsArg = call[1] as { sessionId?: string };
    expect(optionsArg.sessionId).toBe("session-123");

    await client.disconnect();
  });
});
