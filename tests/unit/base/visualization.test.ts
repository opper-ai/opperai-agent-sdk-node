import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { BaseAgent, type BaseAgentConfig } from "@/base/agent";
import { AgentContext } from "@/base/context";
import { HookEvents } from "@/base/hooks";
import { ToolResultFactory, type Tool } from "@/base/tool";
import { generateAgentFlowDiagram } from "@/base/visualization";

// Test agent implementation
class TestAgent extends BaseAgent<string, string> {
  protected override async runLoop(
    input: string,
    context: AgentContext,
  ): Promise<string> {
    void context;
    return `Processed: ${input}`;
  }
}

describe("Visualization", () => {
  describe("generateAgentFlowDiagram", () => {
    it("generates basic mermaid diagram for minimal agent", async () => {
      const agent = new TestAgent({ name: "MinimalAgent" });

      const diagram = await generateAgentFlowDiagram(agent);

      expect(diagram).toContain("```mermaid");
      expect(diagram).toContain("graph TB");
      expect(diagram).toContain("MinimalAgent");
      expect(diagram).toContain("```");
      expect(diagram).toContain("classDef agent");
      expect(diagram).toContain("In: N/A | Out: N/A");
    });

    it("includes agent description in diagram", async () => {
      const agent = new TestAgent({
        name: "DescribedAgent",
        description: "This is a test agent",
      });

      const diagram = await generateAgentFlowDiagram(agent);

      expect(diagram).toContain("This is a test agent");
    });

    it("includes input and output schemas", async () => {
      const agent = new TestAgent({
        name: "SchemaAgent",
        inputSchema: z.string(),
        outputSchema: z.string(),
      });

      const diagram = await generateAgentFlowDiagram(agent);

      expect(diagram).toContain("In: String");
      expect(diagram).toContain("Out: String");
    });

    it("includes tools in diagram", async () => {
      const tool: Tool<{ query: string }, { results: string[] }> = {
        name: "search_tool",
        description: "Search for information",
        schema: z.object({ query: z.string() }),
        execute: async () =>
          ToolResultFactory.success("search_tool", { results: [] }),
      };

      const agent = new TestAgent({
        name: "AgentWithTools",
        tools: [tool],
      });

      const diagram = await generateAgentFlowDiagram(agent);

      expect(diagram).toContain("search_tool");
      expect(diagram).toContain("⚙️");
      expect(diagram).toContain("classDef tool");
    });

    it("includes multiple tools", async () => {
      const tool1: Tool<unknown, unknown> = {
        name: "tool_one",
        schema: z.unknown(),
        execute: async () => ToolResultFactory.success("tool_one", {}),
      };

      const tool2: Tool<unknown, unknown> = {
        name: "tool_two",
        schema: z.unknown(),
        execute: async () => ToolResultFactory.success("tool_two", {}),
      };

      const agent = new TestAgent({
        name: "MultiToolAgent",
        tools: [tool1, tool2],
      });

      const diagram = await generateAgentFlowDiagram(agent);

      expect(diagram).toContain("tool_one");
      expect(diagram).toContain("tool_two");
    });

    it("sanitizes special characters in tool names", async () => {
      const tool: Tool<unknown, unknown> = {
        name: "special-tool_with$chars",
        schema: z.unknown(),
        execute: async () =>
          ToolResultFactory.success("special-tool_with$chars", {}),
      };

      const agent = new TestAgent({
        name: "SanitizeAgent",
        tools: [tool],
      });

      const diagram = await generateAgentFlowDiagram(agent);

      // Should not break mermaid syntax
      expect(diagram).toContain("```mermaid");
      expect(diagram).toContain("```");
    });

    it("shows agent-as-tool in diagram", async () => {
      const subAgent = new TestAgent({ name: "SubAgent" });
      const agentTool = subAgent.asTool();

      const mainAgent = new TestAgent({
        name: "MainAgent",
        tools: [agentTool],
      });

      const diagram = await generateAgentFlowDiagram(mainAgent);

      expect(diagram).toContain("MainAgent");
      expect(diagram).toContain("SubAgent");
      expect(diagram).toContain("🤖");
    });

    it("shows hooks when registered", async () => {
      const agent = new TestAgent({ name: "AgentWithHooks" });

      // Register some hooks
      agent.registerHook(HookEvents.AgentStart, async () => {});
      agent.registerHook(HookEvents.AgentEnd, async () => {});

      const diagram = await generateAgentFlowDiagram(agent);

      expect(diagram).toContain("🪝");
      expect(diagram).toContain("agent:start");
      expect(diagram).toContain("classDef hook");
    });

    it("shows MCP provider nodes when not including tools", async () => {
      const mcpTool: Tool<unknown, unknown> = {
        name: "mcp:server:tool1",
        schema: z.unknown(),
        metadata: {
          provider: "mcp",
          server: "test-server",
        },
        execute: async () => ToolResultFactory.success("mcp:server:tool1", {}),
      };

      const agent = new TestAgent({
        name: "MCPAgent",
        tools: [mcpTool],
      });

      const diagram = await generateAgentFlowDiagram(agent, {
        includeMcpTools: false,
      });

      expect(diagram).toContain("test-server");
      expect(diagram).toContain("🔌");
      expect(diagram).toContain("classDef provider");
    });

    it("shows MCP tools when includeMcpTools is true", async () => {
      const mcpTool1: Tool<unknown, unknown> = {
        name: "mcp:server:tool1",
        schema: z.unknown(),
        metadata: {
          provider: "mcp",
          server: "test-server",
        },
        execute: async () => ToolResultFactory.success("mcp:server:tool1", {}),
      };

      const mcpTool2: Tool<unknown, unknown> = {
        name: "mcp:server:tool2",
        schema: z.unknown(),
        metadata: {
          provider: "mcp",
          server: "test-server",
        },
        execute: async () => ToolResultFactory.success("mcp:server:tool2", {}),
      };

      const agent = new TestAgent({
        name: "MCPAgent",
        tools: [mcpTool1, mcpTool2],
      });

      const diagram = await generateAgentFlowDiagram(agent, {
        includeMcpTools: true,
      });

      expect(diagram).toContain("test-server");
      expect(diagram).toContain("mcp:server:tool1");
      expect(diagram).toContain("mcp:server:tool2");
    });

    it("prevents infinite loops with circular agent references", async () => {
      const agent1 = new TestAgent({ name: "Agent1" });
      const agent2 = new TestAgent({ name: "Agent2" });

      // Create circular reference
      const tool1 = agent1.asTool();
      const tool2 = agent2.asTool();

      agent1.addTool(tool2);
      agent2.addTool(tool1);

      // Should not hang or error
      const diagram = await generateAgentFlowDiagram(agent1);

      expect(diagram).toContain("Agent1");
      expect(diagram).toContain("Agent2");
    });

    it("includes all styling classes", async () => {
      const agent = new TestAgent({ name: "StyledAgent" });

      const diagram = await generateAgentFlowDiagram(agent);

      expect(diagram).toContain("classDef agent");
      expect(diagram).toContain("classDef schema");
      expect(diagram).toContain("classDef tool");
      expect(diagram).toContain("classDef hook");
      expect(diagram).toContain("classDef provider");
    });

    it("uses Opper brand colors in styling", async () => {
      const agent = new TestAgent({ name: "ColoredAgent" });

      const diagram = await generateAgentFlowDiagram(agent);

      // Check for Opper brand colors
      expect(diagram).toContain("#8CF0DC"); // Teal for agents
      expect(diagram).toContain("#FFD7D7"); // Light red for tools
      expect(diagram).toContain("#FFB186"); // Orange for hooks
      expect(diagram).toContain("#8CECF2"); // Light blue for providers
    });
  });

  describe("File output", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = tmpdir();
    });

    it("saves diagram to file when outputPath is provided", async () => {
      const agent = new TestAgent({ name: "FileAgent" });
      const outputPath = join(tempDir, `test-diagram-${Date.now()}.md`);

      const result = await generateAgentFlowDiagram(agent, { outputPath });

      expect(result).toBe(outputPath);

      // Verify file was created
      const fileContent = await fs.readFile(outputPath, "utf-8");
      expect(fileContent).toContain("```mermaid");
      expect(fileContent).toContain("FileAgent");

      // Cleanup
      await fs.unlink(outputPath).catch(() => {});
    });

    it("adds .md extension if not present", async () => {
      const agent = new TestAgent({ name: "ExtensionAgent" });
      const outputPath = join(tempDir, `test-diagram-${Date.now()}`);

      const result = await generateAgentFlowDiagram(agent, { outputPath });

      expect(result).toBe(`${outputPath}.md`);

      // Verify file was created with extension
      const fileContent = await fs.readFile(`${outputPath}.md`, "utf-8");
      expect(fileContent).toContain("```mermaid");

      // Cleanup
      await fs.unlink(`${outputPath}.md`).catch(() => {});
    });

    it("does not double-add .md extension", async () => {
      const agent = new TestAgent({ name: "NoDoubleExtAgent" });
      const outputPath = join(tempDir, `test-diagram-${Date.now()}.md`);

      const result = await generateAgentFlowDiagram(agent, { outputPath });

      expect(result).toBe(outputPath);
      expect(result).not.toContain(".md.md");

      // Cleanup
      await fs.unlink(outputPath).catch(() => {});
    });
  });

  describe("Agent.visualizeFlow() method", () => {
    it("delegates to generateAgentFlowDiagram", async () => {
      const agent = new TestAgent({ name: "DelegateAgent" });

      const diagram = await agent.visualizeFlow();

      expect(diagram).toContain("```mermaid");
      expect(diagram).toContain("DelegateAgent");
    });

    it("passes options through", async () => {
      const agent = new TestAgent({ name: "OptionsAgent" });
      const outputPath = join(tmpdir(), `options-test-${Date.now()}.md`);

      const result = await agent.visualizeFlow({ outputPath });

      expect(result).toBe(outputPath);

      // Cleanup
      await fs.unlink(outputPath).catch(() => {});
    });
  });

  describe("Complex scenarios", () => {
    it("handles agent with all features", async () => {
      const tool: Tool<{ query: string }, { result: string }> = {
        name: "complex_tool",
        description: "A complex tool",
        schema: z.object({ query: z.string() }),
        execute: async () =>
          ToolResultFactory.success("complex_tool", { result: "ok" }),
      };

      const subAgent = new TestAgent({ name: "SubAgent" });

      const config: BaseAgentConfig<string, string> = {
        name: "ComplexAgent",
        description: "Agent with all features",
        instructions: "Do complex things",
        inputSchema: z.string(),
        outputSchema: z.string(),
        tools: [tool, subAgent.asTool()],
        maxIterations: 50,
        model: "claude-3",
      };

      const agent = new TestAgent(config);

      // Add hooks
      agent.registerHook(HookEvents.AgentStart, async () => {});
      agent.registerHook(HookEvents.ToolError, async () => {});

      const diagram = await agent.visualizeFlow();

      expect(diagram).toContain("ComplexAgent");
      expect(diagram).toContain("Agent with all features");
      expect(diagram).toContain("complex_tool");
      expect(diagram).toContain("SubAgent");
      expect(diagram).toContain("In: String");
      expect(diagram).toContain("Out: String");
      expect(diagram).toContain("🤖"); // Agent emoji
      expect(diagram).toContain("⚙️"); // Tool emoji
      expect(diagram).toContain("🪝"); // Hook emoji
    });

    it("handles agent with no tools or hooks", async () => {
      const agent = new TestAgent({
        name: "MinimalAgent",
        description: "Just a simple agent",
      });

      const diagram = await agent.visualizeFlow();

      expect(diagram).toContain("MinimalAgent");
      expect(diagram).toContain("Just a simple agent");
      expect(diagram).toContain("```mermaid");
      expect(diagram).toContain("```");
    });

    it("handles tool with complex zod schema", async () => {
      const tool: Tool<
        { name: string; age: number; tags: string[] },
        { success: boolean }
      > = {
        name: "complex_schema_tool",
        schema: z.object({
          name: z.string(),
          age: z.number(),
          tags: z.array(z.string()),
        }),
        execute: async () =>
          ToolResultFactory.success("complex_schema_tool", { success: true }),
      };

      const agent = new TestAgent({
        name: "SchemaAgent",
        tools: [tool],
      });

      const diagram = await agent.visualizeFlow();

      expect(diagram).toContain("complex_schema_tool");
      // Should extract field names
      expect(diagram).toContain("name");
      expect(diagram).toContain("age");
      expect(diagram).toContain("tags");
    });
  });

  describe("Edge cases", () => {
    it("handles agent with empty name", async () => {
      // This should be prevented by validation, but test defensiveness
      const agent = new TestAgent({ name: "" });

      const diagram = await agent.visualizeFlow();

      expect(diagram).toContain("```mermaid");
    });

    it("handles tool with special characters in description", async () => {
      const tool: Tool<unknown, unknown> = {
        name: "special_tool",
        description: 'Tool with "quotes" and [brackets] and {braces}',
        schema: z.unknown(),
        execute: async () => ToolResultFactory.success("special_tool", {}),
      };

      const agent = new TestAgent({
        name: "SpecialAgent",
        tools: [tool],
      });

      const diagram = await agent.visualizeFlow();

      // Should not break mermaid syntax
      expect(diagram).toContain("```mermaid");
      expect(diagram).toContain("```");
    });

    it("handles multiple hooks of different types", async () => {
      const agent = new TestAgent({ name: "MultiHookAgent" });

      agent.registerHook(HookEvents.AgentStart, async () => {});
      agent.registerHook(HookEvents.AgentEnd, async () => {});
      agent.registerHook(HookEvents.BeforeTool, async () => {});
      agent.registerHook(HookEvents.AfterTool, async () => {});
      agent.registerHook(HookEvents.ToolError, async () => {});

      const diagram = await agent.visualizeFlow();

      expect(diagram).toContain("🪝");
      // Should show count or list
      expect(diagram).toMatch(/agent:start|agent:end|tool:before|tool:after/);
    });
  });
});
