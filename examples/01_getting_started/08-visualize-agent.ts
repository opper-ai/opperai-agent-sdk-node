/**
 * Example 8: Visualizing Agents with Mermaid
 *
 * This example demonstrates:
 * - Generating Mermaid flowchart diagrams of agent structure
 * - Visualizing tools, hooks, schemas, and nested agents
 * - Saving diagrams to files
 * - Different visualization options
 *
 * Run with: pnpm example examples/01_getting_started/08-visualize-agent.ts
 */

import { z } from "zod";
import {
  Agent,
  createFunctionTool,
  ToolResultFactory,
  type ToolExecutionContext,
} from "@opperai/agents";

// Define some tools for our agent
const searchTool = createFunctionTool(
  async (input: { query: string }, _context: ToolExecutionContext) => {
    console.log(`  🔍 Searching for: ${input.query}`);
    return ToolResultFactory.success("search", {
      results: [`Result 1 for ${input.query}`, `Result 2 for ${input.query}`],
    });
  },
  {
    name: "search",
    description: "Search for information on the web",
    schema: z.object({
      query: z.string().describe("Search query"),
    }),
  },
);

const summarizeTool = createFunctionTool(
  async (input: { text: string }, _context: ToolExecutionContext) => {
    console.log(`  📝 Summarizing text...`);
    return ToolResultFactory.success("summarize", {
      summary: `Summary of: ${input.text.substring(0, 50)}...`,
    });
  },
  {
    name: "summarize",
    description: "Summarize a piece of text",
    schema: z.object({
      text: z.string().describe("Text to summarize"),
    }),
  },
);

const calculateTool = createFunctionTool(
  async (input: { expression: string }, _context: ToolExecutionContext) => {
    console.log(`  🧮 Calculating: ${input.expression}`);
    // Simple evaluation (in production, use a safe math parser)
    const result = eval(input.expression);
    return ToolResultFactory.success("calculate", { result });
  },
  {
    name: "calculate",
    description: "Evaluate a mathematical expression",
    schema: z.object({
      expression: z.string().describe("Mathematical expression to evaluate"),
    }),
  },
);

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Agent Visualization Example");
  console.log("=".repeat(60));
  console.log();

  // Example 1: Simple agent with tools
  console.log("1. Simple Agent with Tools");
  console.log("-".repeat(60));

  const simpleAgent = new Agent({
    name: "ResearchAgent",
    description: "An agent that researches topics and provides summaries",
    instructions:
      "Research the given topic and provide a comprehensive summary",
    tools: [searchTool, summarizeTool],
    inputSchema: z.string(),
    outputSchema: z.object({
      summary: z.string(),
      sources: z.array(z.string()),
    }),
    model: "gcp/gemini-flash-lite-latest",
  });

  // Generate and display the diagram
  const simpleDiagram = await simpleAgent.visualizeFlow();
  console.log(simpleDiagram);
  console.log();

  // Example 2: Agent with hooks
  console.log("\n2. Agent with Hooks");
  console.log("-".repeat(60));

  const hookedAgent = new Agent({
    name: "MonitoredAgent",
    description: "An agent with execution monitoring",
    instructions: "Process tasks with detailed monitoring",
    tools: [calculateTool],
    model: "gcp/gemini-flash-lite-latest",
  });

  // Register some hooks
  hookedAgent.registerHook("agent:start", async () => {
    console.log("  Hook: Agent starting...");
  });

  hookedAgent.registerHook("agent:end", async () => {
    console.log("  Hook: Agent completed");
  });

  hookedAgent.registerHook("tool:before", async () => {
    console.log("  Hook: Before tool execution");
  });

  const hookedDiagram = await hookedAgent.visualizeFlow({
    outputPath: "hooked-agent-flow",
  });
  console.log(hookedDiagram);
  console.log();

  // Example 3: Nested agents (agent-as-tool)
  console.log("\n3. Nested Agents");
  console.log("-".repeat(60));

  const dataAgent = new Agent({
    name: "DataProcessor",
    description: "Processes and analyzes data",
    instructions: "Process the given data and return insights",
    tools: [calculateTool],
    model: "gcp/gemini-flash-lite-latest",
  });

  const researchAgent = new Agent({
    name: "ResearchCoordinator",
    description: "Coordinates research and data processing",
    instructions:
      "Coordinate research tasks and delegate to specialized agents",
    tools: [
      searchTool,
      summarizeTool,
      dataAgent.asTool("process_data", "Process and analyze data"),
    ],
    model: "gcp/gemini-flash-lite-latest",
  });

  const nestedDiagram = await researchAgent.visualizeFlow({
    outputPath: "nested-agent-flow",
  });
  console.log(nestedDiagram);
  console.log();

  // Example 4: Save diagram to file
  console.log("\n4. Saving Diagram to File");
  console.log("-".repeat(60));

  const complexAgent = new Agent({
    name: "ComplexAgent",
    description: "A complex agent with multiple tools and capabilities",
    instructions: "Handle complex tasks using all available tools",
    tools: [searchTool, summarizeTool, calculateTool],
    inputSchema: z.object({
      task: z.string(),
      context: z.string().optional(),
    }),
    outputSchema: z.object({
      result: z.string(),
      confidence: z.number(),
    }),
    maxIterations: 10,
    model: "gcp/gemini-flash-lite-latest",
  });

  // Add hooks
  complexAgent.registerHook("agent:start", async () => {});
  complexAgent.registerHook("agent:end", async () => {});
  complexAgent.registerHook("tool:error", async () => {});

  // Save to file
  const outputPath = await complexAgent.visualizeFlow({
    outputPath: "complex-agent-flow",
  });

  console.log(`✅ Diagram saved to: ${outputPath}`);
  console.log();

  // Example 5: Minimal agent
  console.log("\n5. Minimal Agent (no tools or hooks)");
  console.log("-".repeat(60));

  const minimalAgent = new Agent({
    name: "SimpleAssistant",
    description: "A simple conversational assistant",
    instructions: "Be helpful and friendly",
    model: "gcp/gemini-flash-lite-latest",
  });

  const minimalDiagram = await minimalAgent.visualizeFlow();
  console.log(minimalDiagram);
  console.log();

  console.log("=".repeat(60));
  console.log("Visualization Examples Complete!");
  console.log("=".repeat(60));
  console.log();
  console.log("Usage Tips:");
  console.log("  - Copy the mermaid code and paste into:");
  console.log("    - GitHub Markdown files");
  console.log("    - Mermaid Live Editor (https://mermaid.live)");
  console.log("    - VS Code with Mermaid extension");
  console.log("    - Notion, Confluence, etc.");
  console.log();
  console.log("  - Use outputPath option to save diagrams:");
  console.log('    await agent.visualizeFlow({ outputPath: "diagram.md" })');
  console.log();
  console.log("  - Customize with options:");
  console.log("    - includeMcpTools: true  // Show MCP tools detail");
  console.log();
}

// Run the example
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
