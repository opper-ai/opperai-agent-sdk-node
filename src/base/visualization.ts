import { promises as fs } from "node:fs";
import type { ZodType } from "zod";

import type { BaseAgent } from "./agent";
import type { HookManager } from "./hooks";
import { HookEvents } from "./hooks";
import type { Tool } from "./tool";

/**
 * Options for generating agent flow visualization
 */
export interface VisualizationOptions {
  /**
   * Optional file path to save the Mermaid diagram
   * If provided, the diagram will be saved to this path
   * .md extension will be added automatically if not present
   */
  outputPath?: string;

  /**
   * Whether to include MCP tool providers in the visualization
   * When true, will show expanded tools from providers
   * When false, will show providers as single nodes
   * @default false
   */
  includeMcpTools?: boolean;

  /**
   * Internal parameter to track visited agents (prevents cycles)
   * @internal
   */
  _visited?: Set<string>;
}

/**
 * Sanitize a string to be used as a Mermaid node ID
 * Removes special characters and replaces spaces with underscores
 */
function sanitizeId(name: string): string {
  return name
    .replace(/\s/g, "_")
    .replace(/-/g, "_")
    .replace(/\./g, "_")
    .replace(/[()]/g, "");
}

/**
 * Sanitize and truncate label text for Mermaid
 * Takes first sentence, removes problematic characters, and limits length
 */
function sanitizeLabel(text: string): string {
  // Remove problematic characters
  let cleaned = text
    .replace(/"/g, "'")
    .replace(/\n/g, " ")
    .replace(/`/g, "");

  // Take only first sentence
  cleaned = cleaned.split(".")[0]?.trim() || cleaned.trim();

  // Limit length
  if (cleaned.length > 45) {
    cleaned = cleaned.substring(0, 42) + "...";
  }

  return cleaned;
}

/**
 * Get schema name from Zod schema
 * Returns the description or a readable type name with field names for objects
 */
function getSchemaName(schema: ZodType<unknown> | undefined): string {
  if (!schema) {
    return "N/A";
  }

  try {
    const schemaAny = schema as {
      _def?: {
        typeName?: string;
        description?: string;
        shape?: () => Record<string, ZodType<unknown>>;
      };
      description?: string;
    };

    // First check for explicit description (user-provided schema name)
    if (schemaAny.description) {
      return schemaAny.description;
    }

    // Then check _def.description
    if (schemaAny._def?.description) {
      return schemaAny._def.description;
    }

    // For object schemas, show field names
    const typeName = schemaAny._def?.typeName;
    if (typeName === "ZodObject" && schemaAny._def) {
      const shape = schemaAny._def.shape?.();
      if (shape && typeof shape === "object") {
        const keys = Object.keys(shape);
        if (keys.length > 0) {
          // Show first 3 keys
          const keyStr =
            keys.length > 3
              ? `{${keys.slice(0, 3).join(", ")}...}`
              : `{${keys.join(", ")}}`;
          return keyStr;
        }
      }
      return "Object";
    }

    // Fall back to cleaned type name
    if (typeName) {
      return typeName.replace("Zod", "").replace("Type", "");
    }

    return "Any";
  } catch {
    return "Any";
  }
}

/**
 * Extract parameter information from Zod schema
 * Returns list of "paramName: type" strings
 */
function extractParameters(
  schema: ZodType<unknown> | undefined,
): string[] | null {
  if (!schema) {
    return null;
  }

  try {
    const schemaAny = schema as {
      _def?: {
        typeName?: string;
        shape?: () => Record<string, ZodType<unknown>>;
      };
    };

    // For object schemas, extract field names and types
    if (schemaAny._def?.typeName === "ZodObject") {
      const shape = schemaAny._def.shape?.();
      if (shape && typeof shape === "object") {
        const params: string[] = [];
        for (const [key, value] of Object.entries(shape)) {
          const fieldType = (value as { _def?: { typeName?: string } })?._def
            ?.typeName;
          if (fieldType) {
            const cleanType = fieldType.replace("Zod", "").toLowerCase();
            params.push(`${key}: ${cleanType}`);
          } else {
            params.push(key);
          }
        }
        return params.length > 0 ? params : null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get hook event names registered on a HookManager
 */
function getRegisteredHooks(hooks: HookManager): string[] {
  const events: string[] = [];
  const allEvents = Object.values(HookEvents);

  for (const event of allEvents) {
    if (hooks.listenerCount(event) > 0) {
      events.push(event);
    }
  }

  return events;
}

/**
 * Get wrapped agent from tool metadata
 */
function getWrappedAgent(
  tool: Tool<unknown, unknown>,
): BaseAgent<unknown, unknown> | null {
  const wrapped = tool.metadata?.["wrappedAgent"];
  if (wrapped && typeof wrapped === "object" && "name" in wrapped) {
    return wrapped as BaseAgent<unknown, unknown>;
  }
  return null;
}

/**
 * Check if a tool is from an MCP provider
 */
function isMcpTool(tool: Tool<unknown, unknown>): boolean {
  return tool.metadata?.["provider"] === "mcp";
}

/**
 * Generate Mermaid graph diagram for an agent's structure and flow
 *
 * @param agent - The agent to visualize
 * @param options - Visualization options
 * @returns Mermaid markdown string, or file path if outputPath was provided
 */
export async function generateAgentFlowDiagram<I, O>(
  agent: BaseAgent<I, O>,
  options: VisualizationOptions = {},
): Promise<string> {
  const visited = options._visited ?? new Set<string>();
  const isRoot = visited.size === 0;

  const lines: string[] = [];

  if (isRoot) {
    lines.push("```mermaid");
    lines.push("graph TB");
  }

  // Avoid cycles
  const agentId = sanitizeId(agent.name);
  if (visited.has(agentId)) {
    return "";
  }
  visited.add(agentId);

  // Main agent node with description and schemas
  let agentLabel = `🤖 ${agent.name}`;

  if (
    agent.description &&
    agent.description !== `Agent: ${agent.name}` &&
    agent.description !== agent.name
  ) {
    const desc = sanitizeLabel(agent.description);
    agentLabel += `<br/><i>${desc}</i>`;
  }

  // Add schema info
  const inputSchemaName = getSchemaName(agent.inputSchema);
  const outputSchemaName = getSchemaName(agent.outputSchema);
  agentLabel += `<br/>In: ${inputSchemaName} | Out: ${outputSchemaName}`;

  lines.push(`    ${agentId}["${agentLabel}"]:::agent`);

  // Hooks
  const agentWithHooks = agent as unknown as { hooks: HookManager };
  const registeredHooks = getRegisteredHooks(agentWithHooks.hooks);

  if (registeredHooks.length > 0) {
    const hookId = `${agentId}_hooks`;
    // Show first 3 hooks
    const hookNames = registeredHooks.slice(0, 3).join(", ");
    const hookLabel =
      registeredHooks.length > 3
        ? `${hookNames} +${registeredHooks.length - 3}`
        : hookNames;
    lines.push(`    ${hookId}["🪝 ${hookLabel}"]:::hook`);
    lines.push(`    ${agentId} -.-> ${hookId}`);
  }

  // Get tools to show
  const tools = agent.getTools();

  // Separate regular tools from MCP tools and agent tools
  const regularTools: Tool<unknown, unknown>[] = [];
  const mcpToolsByServer = new Map<string, Tool<unknown, unknown>[]>();
  const agentTools: Tool<unknown, unknown>[] = [];

  for (const tool of tools) {
    const wrappedAgent = getWrappedAgent(tool);
    if (wrappedAgent) {
      agentTools.push(tool);
    } else if (isMcpTool(tool)) {
      const serverName =
        (tool.metadata?.["server"] as string | undefined) ?? "unknown";
      const serverTools = mcpToolsByServer.get(serverName) ?? [];
      serverTools.push(tool);
      mcpToolsByServer.set(serverName, serverTools);
    } else {
      regularTools.push(tool);
    }
  }

  // Add regular tools
  for (const tool of regularTools) {
    const toolId = sanitizeId(`${agentId}_${tool.name}`);
    let toolLabel = `⚙️ ${sanitizeLabel(tool.name)}`;

    // Add description if available
    if (tool.description) {
      const desc = sanitizeLabel(tool.description);
      toolLabel += `<br/><i>${desc}</i>`;
    }

    // Add parameters
    const params = extractParameters(tool.schema);
    if (params && params.length > 0) {
      const paramsStr =
        params.length > 3
          ? `${params.slice(0, 3).join(", ")}...`
          : params.join(", ");
      toolLabel += `<br/>(${paramsStr})`;
    }

    lines.push(`    ${toolId}["${toolLabel}"]:::tool`);
    lines.push(`    ${agentId} --> ${toolId}`);
  }

  // Add MCP providers or tools
  if (mcpToolsByServer.size > 0) {
    for (const [serverName, serverTools] of mcpToolsByServer.entries()) {
      if (options.includeMcpTools) {
        // Show individual tools
        for (const tool of serverTools) {
          const toolId = sanitizeId(`${agentId}_${tool.name}`);
          let toolLabel = `⚙️ ${sanitizeLabel(tool.name)}`;

          if (tool.description) {
            const desc = sanitizeLabel(tool.description);
            toolLabel += `<br/><i>${desc}</i>`;
          }

          toolLabel += `<br/>(MCP: ${sanitizeLabel(serverName)})`;

          lines.push(`    ${toolId}["${toolLabel}"]:::tool`);
          lines.push(`    ${agentId} --> ${toolId}`);
        }
      } else {
        // Show provider node
        const providerId = sanitizeId(`${agentId}_provider_${serverName}`);
        lines.push(`    ${providerId}["🔌 ${serverName}"]:::provider`);
        lines.push(`    ${agentId} --> ${providerId}`);
      }
    }
  }

  // Add sub-agents recursively
  for (const tool of agentTools) {
    const wrappedAgent = getWrappedAgent(tool);
    if (wrappedAgent) {
      const subAgentId = sanitizeId(wrappedAgent.name);
      lines.push(`    ${agentId} --> ${subAgentId}`);

      // Recursively visualize sub-agent
      const subDiagram = await generateAgentFlowDiagram(wrappedAgent, {
        ...options,
        _visited: visited,
      });

      // Add sub-agent lines (filter out mermaid wrappers and styling)
      const subLines = subDiagram
        .split("\n")
        .filter(
          (line) =>
            line &&
            !line.includes("```mermaid") &&
            !line.includes("```") &&
            !line.includes("%% Styling") &&
            !line.includes("classDef"),
        );

      lines.push(...subLines);
    }
  }

  // Add styling (only for root call)
  if (isRoot) {
    lines.push("");
    lines.push("    %% Styling - Opper Brand Colors");
    lines.push(
      "    classDef agent fill:#8CF0DC,stroke:#1B2E40,stroke-width:3px,color:#1B2E40",
    );
    lines.push(
      "    classDef tool fill:#FFD7D7,stroke:#3C3CAF,stroke-width:2px,color:#1B2E40",
    );
    lines.push(
      "    classDef schema fill:#F8F8F8,stroke:#3C3CAF,stroke-width:2px,color:#1B2E40",
    );
    lines.push(
      "    classDef hook fill:#FFB186,stroke:#3C3CAF,stroke-width:2px,color:#1B2E40",
    );
    lines.push(
      "    classDef provider fill:#8CECF2,stroke:#1B2E40,stroke-width:2px,color:#1B2E40",
    );
    lines.push("```");
  }

  const diagram = lines.join("\n");

  // Save to file if requested (only for root call)
  if (options.outputPath && isRoot) {
    let filePath = options.outputPath;
    if (!filePath.endsWith(".md")) {
      filePath += ".md";
    }

    // Add title to markdown file
    const fileContent = `# Agent Flow: ${agent.name}\n\n${diagram}`;
    await fs.writeFile(filePath, fileContent, "utf-8");
    return filePath;
  }

  return diagram;
}
