import { describe, expect, it, vi } from "vitest";

import type { BaseAgent } from "@/base/agent";
import { AgentContext } from "@/base/context";
import type { ToolExecutionContext } from "@/base/tool";
import type { MCPClient, MCPTool } from "@/mcp/client";
import { MCPconfig } from "@/mcp/config";
import {
  MCPToolProvider,
  type MCPToolProviderOptions,
  mcp,
} from "@/mcp/provider";

class FakeMcpClient {
  public readonly connect = vi.fn().mockResolvedValue(undefined);
  public readonly disconnect = vi.fn().mockResolvedValue(undefined);
  public readonly listTools = vi.fn<() => Promise<MCPTool[]>>();
  public readonly callTool =
    vi.fn<
      (
        toolName: string,
        args: Record<string, unknown> | undefined,
      ) => Promise<unknown>
    >();

  public constructor(
    tools: MCPTool[],
    result: unknown,
    private readonly shouldThrow = false,
  ) {
    this.listTools.mockResolvedValue(tools);
    if (this.shouldThrow) {
      this.callTool.mockImplementation(async () => {
        throw result instanceof Error ? result : new Error(String(result));
      });
    } else {
      this.callTool.mockResolvedValue(result);
    }
  }
}

const createContext = (): ToolExecutionContext => ({
  agentContext: new AgentContext({ agentName: "TestAgent" }),
});

const baseTool: MCPTool = {
  name: "read_file",
  description: "Read a file from disk",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
      },
    },
    required: ["path"],
  },
};

describe("MCPToolProvider", () => {
  it("mcp helper creates provider from plain config", () => {
    const provider = mcp({
      name: "filesystem",
      transport: "stdio",
      command: "node",
    });

    expect(provider).toBeInstanceOf(MCPToolProvider);
  });

  it("wraps MCP tools as agent tools", async () => {
    const config = MCPconfig({
      name: "filesystem",
      transport: "stdio",
      command: "node",
    });

    const fakeResult = { content: [{ type: "text", text: "ok" }] };
    const clients: FakeMcpClient[] = [];
    const options: MCPToolProviderOptions = {
      clientFactory: () => {
        const client = new FakeMcpClient([baseTool], fakeResult);
        clients.push(client);
        return client as unknown as MCPClient;
      },
    };

    const provider = new MCPToolProvider([config], options);
    const agentStub = {} as unknown as BaseAgent<unknown, unknown>;
    const tools = await provider.setup(agentStub);

    expect(tools).toHaveLength(1);

    const tool = tools[0];
    expect(tool).toBeDefined();

    const context = createContext();
    const result = await tool!.execute({ path: "/tmp/demo.txt" }, context);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toEqual(fakeResult);
    }

    expect(clients[0]).toBeDefined();
    const createdClient = clients[0]!;

    expect(createdClient.callTool).toHaveBeenCalledWith(baseTool.name, {
      path: "/tmp/demo.txt",
    });

    await provider.teardown();
    expect(createdClient.disconnect).toHaveBeenCalled();
  });

  it("returns failure ToolResult when callTool throws", async () => {
    const config = MCPconfig({
      name: "filesystem",
      transport: "stdio",
      command: "node",
    });

    const error = new Error("boom");
    const client = new FakeMcpClient([baseTool], error, true);
    const provider = new MCPToolProvider([config], {
      clientFactory: () => client as unknown as MCPClient,
    });

    const agentStub = {} as unknown as BaseAgent<unknown, unknown>;
    const tools = await provider.setup(agentStub);
    const tool = tools[0];
    expect(tool).toBeDefined();

    const context = createContext();
    const result = await tool!.execute({ path: "/tmp/demo.txt" }, context);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(Error);
      const message =
        result.error instanceof Error
          ? result.error.message
          : String(result.error);
      expect(message).toBe("boom");
    }
  });
});
