import { MCPClient, type MCPClientOptions, type MCPTool } from "./client";
import {
  MCPServerConfigSchema,
  type MCPServerConfig,
  type MCPServerConfigInput,
} from "./config";
import type { BaseAgent } from "../base/agent";
import {
  ToolResultFactory,
  type Tool,
  type ToolExecutionContext,
  type ToolProvider,
} from "../base/tool";

export interface MCPToolProviderOptions {
  namePrefix?: string;
  clientOptions?: MCPClientOptions;
  clientFactory?: (
    config: MCPServerConfig,
    options?: MCPClientOptions,
  ) => MCPClient;
  logger?: {
    debug?: (message: string, context?: Record<string, unknown>) => void;
    info?: (message: string, context?: Record<string, unknown>) => void;
    warn?: (message: string, context?: Record<string, unknown>) => void;
    error?: (message: string, context?: Record<string, unknown>) => void;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

type ProviderLogger = {
  debug?: (message: string, context?: Record<string, unknown>) => void;
  info?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
  error?: (message: string, context?: Record<string, unknown>) => void;
};

export class MCPToolProvider implements ToolProvider {
  private readonly configs: ReadonlyArray<MCPServerConfig>;
  private readonly namePrefix: string | undefined;
  private readonly clientOptions: MCPClientOptions | undefined;
  private readonly clientFactory: (
    config: MCPServerConfig,
    options?: MCPClientOptions,
  ) => MCPClient;
  private readonly logger: ProviderLogger;
  private readonly clients: Map<string, MCPClient>;

  constructor(
    configs: ReadonlyArray<MCPServerConfig>,
    options: MCPToolProviderOptions = {},
  ) {
    if (configs.length === 0) {
      throw new Error(
        "MCPToolProvider requires at least one server configuration",
      );
    }

    this.configs = configs;
    this.namePrefix = options.namePrefix ?? undefined;
    this.clientOptions = options.clientOptions ?? undefined;
    this.clientFactory =
      options.clientFactory ??
      ((config, factoryOptions) =>
        MCPClient.fromConfig(config, factoryOptions));
    this.logger = options.logger ?? {
      warn: (message: string, context?: Record<string, unknown>) =>
        console.warn(`[MCPToolProvider] ${message}`, context),
      error: (message: string, context?: Record<string, unknown>) =>
        console.error(`[MCPToolProvider] ${message}`, context),
      debug: () => {},
    };
    this.clients = new Map();
  }

  async setup(
    agent: BaseAgent<unknown, unknown>,
  ): Promise<Array<Tool<unknown, unknown>>> {
    void agent;
    const tools: Array<Tool<unknown, unknown>> = [];

    for (const config of this.configs) {
      let client: MCPClient | null = null;
      try {
        client = this.clientFactory(config, this.clientOptions);
        await client.connect();
        this.clients.set(config.name, client);

        const mcpTools = await client.listTools();
        for (const mcpTool of mcpTools) {
          tools.push(this.wrapTool(config, client, mcpTool));
        }

        this.logger?.debug?.("Registered MCP server tools", {
          server: config.name,
          toolCount: mcpTools.length,
        });
      } catch (error) {
        this.logger?.warn?.("Failed to initialize MCP server", {
          server: config.name,
          error: error instanceof Error ? error.message : String(error),
        });

        if (client) {
          await client.disconnect().catch(() => {});
          this.clients.delete(config.name);
        }
      }
    }

    return tools;
  }

  async teardown(): Promise<void> {
    const disconnects = Array.from(this.clients.entries()).map(
      async ([serverName, client]) => {
        try {
          await client.disconnect();
          this.logger?.debug?.("Disconnected MCP server", {
            server: serverName,
          });
        } catch (error) {
          this.logger?.warn?.("Error disconnecting MCP server", {
            server: serverName,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          this.clients.delete(serverName);
        }
      },
    );

    await Promise.allSettled(disconnects);
  }

  private wrapTool(
    config: MCPServerConfig,
    client: MCPClient,
    mcpTool: MCPTool,
  ): Tool<unknown, unknown> {
    const prefix = this.namePrefix ?? config.name;
    const toolName = `${prefix}:${mcpTool.name}`;

    return {
      name: toolName,
      description: mcpTool.description,
      metadata: {
        provider: "mcp",
        server: config.name,
        originalToolName: mcpTool.name,
        parameters: mcpTool.parameters,
        outputSchema: mcpTool.outputSchema,
      },
      execute: async (input: unknown, context: ToolExecutionContext) => {
        void context;
        const startedAt = Date.now();
        const args = isRecord(input)
          ? input
          : input === undefined
            ? {}
            : { value: input };

        try {
          const result = await client.callTool(mcpTool.name, args);
          return ToolResultFactory.success(toolName, result, {
            metadata: {
              provider: "mcp",
              server: config.name,
              tool: mcpTool.name,
            },
            startedAt,
            finishedAt: Date.now(),
          });
        } catch (error) {
          const failure =
            error instanceof Error ? error : new Error(String(error));
          return ToolResultFactory.failure(toolName, failure, {
            metadata: {
              provider: "mcp",
              server: config.name,
              tool: mcpTool.name,
            },
            startedAt,
            finishedAt: Date.now(),
          });
        }
      },
    };
  }
}

export const mcp = (
  ...configs: ReadonlyArray<MCPServerConfig | MCPServerConfigInput>
): MCPToolProvider => {
  if (configs.length === 0) {
    throw new Error("At least one MCP server configuration is required");
  }

  const parsedConfigs = configs.map((config) =>
    MCPServerConfigSchema.parse(config),
  );

  return new MCPToolProvider(parsedConfigs);
};
