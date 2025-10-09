import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { StreamableHTTPClientTransportOptions } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";
import type { IOType } from "node:child_process";
import type { Stream } from "node:stream";

import { MCPServerConfig } from "./config";

export interface MCPTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface MCPClientOptions {
  clientInfo?: Implementation;
}

const DEFAULT_CLIENT_INFO: Implementation = {
  name: "opper-agent-ts-mcp-client",
  version: "0.0.0",
};

export class MCPClient {
  private readonly config: MCPServerConfig;
  private readonly client: Client;
  private transport:
    | StdioClientTransport
    | SSEClientTransport
    | StreamableHTTPClientTransport
    | null;
  private connected: boolean;
  private toolCache: MCPTool[] | null;

  constructor(config: MCPServerConfig, options: MCPClientOptions = {}) {
    this.config = config;
    this.client = new Client(options.clientInfo ?? DEFAULT_CLIENT_INFO, {
      enforceStrictCapabilities: false,
    });
    this.transport = null;
    this.connected = false;
    this.toolCache = null;
  }

  static fromConfig(
    config: MCPServerConfig,
    options?: MCPClientOptions,
  ): MCPClient {
    return new MCPClient(config, options);
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    const transport = this.createTransport();
    this.transport = transport;

    try {
      await this.client.connect(transport as Transport);
      this.connected = true;
    } catch (error) {
      await transport.close().catch(() => {});
      this.transport = null;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    await this.client.close().catch(() => {});
    await this.transport?.close().catch(() => {});
    this.transport = null;
    this.connected = false;
    this.toolCache = null;
  }

  async listTools(): Promise<MCPTool[]> {
    const session = this.ensureConnected();

    if (this.toolCache) {
      return this.toolCache;
    }

    const response = await session.listTools({});
    const tools =
      response.tools?.map((tool) => {
        const parameters = (tool.inputSchema ?? {}) as Record<string, unknown>;
        const outputSchema = tool["outputSchema"] as
          | Record<string, unknown>
          | undefined;

        const normalized: MCPTool = {
          name: tool.name,
          description: tool.description ?? "",
          parameters,
        };

        if (outputSchema) {
          normalized.outputSchema = outputSchema;
        }

        return normalized;
      }) ?? [];

    this.toolCache = tools;
    return tools;
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown> | undefined,
  ): Promise<unknown> {
    const session = this.ensureConnected();

    const response = await session.callTool({
      name: toolName,
      arguments: args,
    });

    return response;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  private ensureConnected(): Client {
    if (!this.connected) {
      throw new Error(`MCP server "${this.config.name}" is not connected`);
    }

    return this.client;
  }

  private createTransport():
    | StdioClientTransport
    | SSEClientTransport
    | StreamableHTTPClientTransport {
    if (this.config.transport === "stdio") {
      const stdioOptions: {
        command: string;
        args?: string[];
        env?: Record<string, string>;
        cwd?: string;
        stderr?: IOType | Stream | number;
      } = {
        command: this.config.command,
      };

      if (this.config.args.length > 0) {
        stdioOptions.args = this.config.args;
      }

      if (Object.keys(this.config.env).length > 0) {
        stdioOptions.env = this.config.env;
      }

      if (this.config.cwd) {
        stdioOptions.cwd = this.config.cwd;
      }

      if (this.config.stderr) {
        stdioOptions.stderr = this.config.stderr as IOType;
      }

      return new StdioClientTransport(stdioOptions);
    }

    if (this.config.transport === "streamable-http") {
      const options: StreamableHTTPClientTransportOptions = {};
      const headers = this.config.headers;

      if (headers && Object.keys(headers).length > 0) {
        options.requestInit = { headers } satisfies RequestInit;
      }

      if (this.config.sessionId) {
        options.sessionId = this.config.sessionId;
      }

      return new StreamableHTTPClientTransport(
        new URL(this.config.url),
        options,
      );
    }

    const headers = this.config.headers ?? {};
    const headerEntries = Object.entries(headers);

    type EventSourceInitLike = {
      fetch?: (url: string | URL, init?: RequestInit) => Promise<Response>;
    };

    const options: {
      eventSourceInit?: EventSourceInitLike;
      requestInit?: RequestInit;
    } = {};

    if (headerEntries.length > 0) {
      options.eventSourceInit = {
        fetch: async (url: string | URL, init?: RequestInit) => {
          const mergedHeaders = new Headers(init?.headers ?? {});
          for (const [key, value] of headerEntries) {
            mergedHeaders.set(key, value);
          }
          if (!mergedHeaders.has("Accept")) {
            mergedHeaders.set("Accept", "text/event-stream");
          }
          return fetch(url, {
            ...init,
            headers: mergedHeaders,
          });
        },
      } satisfies EventSourceInitLike;
    }

    if (headerEntries.length > 0 || this.config.method === "POST") {
      options.requestInit = {
        ...(this.config.method ? { method: this.config.method } : {}),
        ...(headerEntries.length > 0 ? { headers } : {}),
      } satisfies RequestInit;
    }

    return new SSEClientTransport(new URL(this.config.url), options);
  }
}
