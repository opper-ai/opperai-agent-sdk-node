/**
 * Deep Research Agent with Composio MCP
 *
 * Demonstrates a comprehensive research agent that uses Composio's search tools
 * via MCP (Model Context Protocol) to gather information and build detailed reports.
 *
 * This example shows:
 * - Using MCP for external tool providers (Composio search)
 * - Structured input/output schemas for research tasks
 * - Custom tools alongside MCP tools
 * - Hook-based monitoring of agent iterations
 * - Deep research workflows with multiple iterations
 *
 * Prerequisites:
 * - Composio MCP URL with search capabilities
 * - Set COMPOSIO_SEARCH_MCP_URL environment variable
 *
 * Run with: pnpm example examples/applied_agents/deep-research-agent.ts
 */

import { z } from "zod";
import { promises as fs } from "fs";
import {
  Agent,
  HookEvents,
  MCPconfig,
  mcp,
  createFunctionTool,
  ToolResultFactory,
  type ToolExecutionContext,
} from "opper-agents";

// --- Input Schema ---

const ResearchRequestSchema = z.object({
  topic: z.string().describe("The main topic or question to research"),
  depth: z
    .string()
    .default("comprehensive")
    .describe("Research depth: 'quick', 'standard', or 'comprehensive'"),
  focus_areas: z
    .array(z.string())
    .optional()
    .describe("Specific areas or subtopics to focus on"),
  sources_required: z
    .number()
    .int()
    .default(10)
    .describe("Minimum number of sources to gather"),
});

type ResearchRequest = z.infer<typeof ResearchRequestSchema>;

// --- Output Schema ---

const ResearchFindingsSchema = z.object({
  thoughts: z.string().describe("Research process thoughts and methodology"),
  topic: z.string().describe("The researched topic"),
  executive_summary: z.string().describe("High-level summary of findings"),
  key_findings: z.array(z.string()).describe("Main findings from the research"),
  detailed_analysis: z.string().describe("In-depth analysis of the topic"),
});

type ResearchFindings = z.infer<typeof ResearchFindingsSchema>;

// --- Custom Tool: Save Report ---

const saveReportTool = createFunctionTool(
  async (input: { report: string }, _context: ToolExecutionContext) => {
    await fs.writeFile("report.md", input.report, "utf-8");
    return ToolResultFactory.success(
      "save_report",
      "Report saved to report.md",
    );
  },
  {
    name: "save_report",
    description: "Save the comprehensive report to a file in markdown format",
    schema: z.object({
      report: z
        .string()
        .describe("The markdown-formatted report content to save"),
    }),
  },
);

// --- Main Function ---

async function main(): Promise<void> {
  // Check for required environment variables
  const composioUrl = process.env["COMPOSIO_SEARCH_MCP_URL"];
  if (!composioUrl) {
    console.error(
      "❌ Error: COMPOSIO_SEARCH_MCP_URL environment variable not set",
    );
    console.error("\nTo use this example:");
    console.error("1. Get a Composio MCP search endpoint");
    console.error("2. Export COMPOSIO_SEARCH_MCP_URL with your endpoint");
    console.error("3. Optionally export COMPOSIO_API_KEY if required");
    process.exit(1);
  }

  if (!process.env["OPPER_API_KEY"]) {
    console.error("❌ Error: OPPER_API_KEY environment variable not set");
    process.exit(1);
  }

  console.log("🔬 Deep Research Agent with Composio MCP");
  console.log("=".repeat(60));

  // Configure Composio MCP server for search tools
  const composioApiKey = process.env["COMPOSIO_API_KEY"];
  const composioConfig = MCPconfig({
    name: "composio-search",
    transport: "streamable-http",
    url: composioUrl,
    ...(composioApiKey && {
      headers: {
        Authorization: `Bearer ${composioApiKey}`,
      },
    }),
  });

  // Agent instructions
  const instructions = `
You are a comprehensive research agent with access to web search and content extraction tools.

Guidelines:
- Use the search tools to find diverse, high-quality sources
- Extract and analyze content from multiple sources
- Synthesize information into a cohesive narrative
- Build a comprehensive understanding before concluding
- Save the final report using the save_report tool when complete
- Aim for depth and breadth in your research

Research Process:
1. Search for general information about the topic
2. Identify key subtopics and areas to explore
3. Deep dive into each focus area with targeted searches
4. Extract and analyze content from relevant sources
5. Synthesize findings into structured output
6. Save the comprehensive report to a file
`;

  // Create the research agent
  const agent = new Agent({
    name: "ComprehensiveResearchAgent",
    description:
      "A comprehensive research agent that uses search tools to gather information and build detailed reports",
    instructions,
    inputSchema: ResearchRequestSchema,
    outputSchema: ResearchFindingsSchema,
    tools: [
      mcp(composioConfig), // MCP tools from Composio
      saveReportTool, // Custom local tool
    ],
    model: "gcp/gemini-flash-lite-latest", // You can use any model
    maxIterations: 10, // Give plenty of iterations for deep research
    verbose: true,
  });

  // Track token usage per iteration
  let previousTotalTokens = 0;

  // Hook to monitor agent reasoning and token usage during research
  agent.registerHook(HookEvents.LoopEnd, ({ context }) => {
    const latest = context.executionHistory.at(-1);

    // Calculate tokens for this iteration
    const currentTotalTokens = context.usage.totalTokens;
    const iterationTokens = currentTotalTokens - previousTotalTokens;
    previousTotalTokens = currentTotalTokens;

    // Log reasoning
    if (latest?.thought && typeof latest.thought === "object") {
      const thought = latest.thought as Record<string, unknown>;
      const reasoning = thought["reasoning"];
      if (typeof reasoning === "string") {
        console.log(`\n[Iteration ${latest.iteration}] ${reasoning}`);
      }
    }

    // Log token usage for this iteration
    console.log(
      `📊 Tokens - Iteration: ${iterationTokens.toLocaleString()} | Cumulative: ${currentTotalTokens.toLocaleString()}`,
    );
    console.log(
      `   Input: ${context.usage.inputTokens.toLocaleString()} | Output: ${context.usage.outputTokens.toLocaleString()}\n`,
    );
  });

  // Track execution time and capture final statistics
  const startTime = Date.now();

  type FinalStats = {
    duration: string;
    iterations: number;
    toolCalls: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    requests: number;
    avgTokensPerIteration: number;
    cost: {
      generation: number;
      platform: number;
      total: number;
    };
  };

  let finalStats: FinalStats | null = null;

  // Hook to capture final statistics
  agent.registerHook(HookEvents.AgentEnd, ({ context }) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    finalStats = {
      duration,
      iterations: context.iteration + 1,
      toolCalls: context.toolCalls.length,
      totalTokens: context.usage.totalTokens,
      inputTokens: context.usage.inputTokens,
      outputTokens: context.usage.outputTokens,
      requests: context.usage.requests,
      avgTokensPerIteration: Math.round(
        context.usage.totalTokens / (context.iteration + 1),
      ),
      cost: context.usage.cost,
    };
  });

  // Execute research
  console.log("\n🔍 Starting research process...\n");

  const result = await agent.process({
    topic: "What is Opper AI?",
    depth: "comprehensive",
    focus_areas: ["traction", "team", "product", "innovation"],
    sources_required: 3,
  });

  console.log("\n" + "=".repeat(60));
  console.log("FINAL RESEARCH FINDINGS:");
  console.log("=".repeat(60));
  console.log("\n📋 Topic:", result.topic);
  console.log("\n💡 Executive Summary:");
  console.log(result.executive_summary);
  console.log("\n🔑 Key Findings:");
  result.key_findings.forEach((finding, i) => {
    console.log(`   ${i + 1}. ${finding}`);
  });
  console.log("\n📊 Detailed Analysis:");
  console.log(result.detailed_analysis);
  console.log("\n💭 Research Thoughts:");
  console.log(result.thoughts);

  if (finalStats) {
    const stats = finalStats as FinalStats;
    console.log("\n" + "=".repeat(60));
    console.log("EXECUTION STATISTICS:");
    console.log("=".repeat(60));
    console.log(`⏱️  Duration: ${stats.duration}s`);
    console.log(`🔄 Iterations: ${stats.iterations}`);
    console.log(`🔧 Tool Calls: ${stats.toolCalls}`);
    console.log(`📊 Total Tokens: ${stats.totalTokens.toLocaleString()}`);
    console.log(`   Input Tokens: ${stats.inputTokens.toLocaleString()}`);
    console.log(`   Output Tokens: ${stats.outputTokens.toLocaleString()}`);
    console.log(`   Requests: ${stats.requests}`);
    console.log(
      `   Avg Tokens/Iteration: ${stats.avgTokensPerIteration.toLocaleString()}`,
    );
    console.log(`💰 Cost:`);
    console.log(`   Generation: $${stats.cost.generation.toFixed(6)}`);
    console.log(`   Platform: $${stats.cost.platform.toFixed(6)}`);
    console.log(`   Total: $${stats.cost.total.toFixed(6)}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ Research Complete! Check report.md for the full report.");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
