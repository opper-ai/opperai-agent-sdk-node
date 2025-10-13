/**
 * Example 6: Token Usage and Cost Tracking
 *
 * This example demonstrates:
 * - Tracking token usage per iteration
 * - Monitoring cumulative costs
 * - Understanding agent resource consumption
 * - Hook-based usage monitoring
 *
 * Run with: pnpm example examples/01_getting_started/06_token_and_cost.ts
 */

import { z } from "zod";
import {
  Agent,
  HookEvents,
  createFunctionTool,
  ToolResultFactory,
  type ToolExecutionContext,
} from "@opperai/agents";

// --- Simple Tools for Multi-Iteration Process ---

const fetchDataTool = createFunctionTool(
  async (
    input: { source: string },
    _context: ToolExecutionContext,
  ): Promise<ReturnType<typeof ToolResultFactory.success>> => {
    console.log(`  🔧 Fetching data from: ${input.source}`);

    // Simulate fetching data
    const mockData: Record<string, unknown> = {
      users: { count: 150, active: 120 },
      sales: { total: 50000, monthly: 4200 },
      traffic: { visits: 10000, unique: 7500 },
    };

    return ToolResultFactory.success("fetch_data", mockData[input.source]);
  },
  {
    name: "fetch_data",
    description: "Fetch data from various sources (users, sales, traffic)",
    schema: z.object({
      source: z
        .enum(["users", "sales", "traffic"])
        .describe("The data source to fetch from"),
    }),
  },
);

const calculateTool = createFunctionTool(
  async (
    input: { operation: string; value: number },
    _context: ToolExecutionContext,
  ): Promise<ReturnType<typeof ToolResultFactory.success>> => {
    console.log(`  🔧 Calculating: ${input.operation} on ${input.value}`);

    const operations: Record<string, (v: number) => number> = {
      double: (v) => v * 2,
      square: (v) => v * v,
      percent: (v) => v / 100,
    };

    const result = operations[input.operation]?.(input.value) ?? input.value;
    return ToolResultFactory.success("calculate", result);
  },
  {
    name: "calculate",
    description: "Perform calculations (double, square, percent)",
    schema: z.object({
      operation: z
        .enum(["double", "square", "percent"])
        .describe("The operation to perform"),
      value: z.number().describe("The value to operate on"),
    }),
  },
);

const formatReportTool = createFunctionTool(
  async (
    input: { title: string; data: Record<string, unknown> },
    _context: ToolExecutionContext,
  ): Promise<ReturnType<typeof ToolResultFactory.success>> => {
    console.log(`  🔧 Formatting report: ${input.title}`);

    const report = `
# ${input.title}

${Object.entries(input.data)
  .map(([key, value]) => `- **${key}**: ${JSON.stringify(value)}`)
  .join("\n")}
    `.trim();

    return ToolResultFactory.success("format_report", report);
  },
  {
    name: "format_report",
    description: "Format data into a readable report",
    schema: z.object({
      title: z.string().describe("Report title"),
      data: z.record(z.unknown()).describe("Data to include in the report"),
    }),
  },
);

// --- Main Function ---

async function main(): Promise<void> {
  console.log("📊 Token Usage and Cost Tracking Example");
  console.log("=".repeat(60));

  // Create an agent that will use multiple tools
  const agent = new Agent({
    name: "DataAnalystAgent",
    description: "Analyzes data and generates reports",
    instructions: `
You are a data analyst. When asked to analyze data:
1. Fetch the relevant data using fetch_data
2. Perform any necessary calculations using calculate
3. Format the results into a report using format_report

Always provide comprehensive analysis.
    `.trim(),
    tools: [fetchDataTool, calculateTool, formatReportTool],
    maxIterations: 10,
    verbose: true,
    model: "gcp/gemini-flash-lite-latest",
  });

  // --- Track Token Usage Per Iteration ---
  let previousTotalTokens = 0;

  agent.registerHook(HookEvents.LoopEnd, ({ context }) => {
    // Calculate tokens used in this iteration
    const currentTotalTokens = context.usage.totalTokens;
    const iterationTokens = currentTotalTokens - previousTotalTokens;
    previousTotalTokens = currentTotalTokens;

    console.log(`\n[Iteration ${context.iteration + 1}] Token Usage:`);
    console.log(`  This iteration: ${iterationTokens.toLocaleString()} tokens`);
    console.log(
      `  Cumulative total: ${currentTotalTokens.toLocaleString()} tokens`,
    );
    console.log(
      `  Input: ${context.usage.inputTokens.toLocaleString()} | Output: ${context.usage.outputTokens.toLocaleString()}`,
    );
  });

  // --- Track Overall Statistics at End ---
  const startTime = Date.now();

  agent.registerHook(HookEvents.AgentEnd, ({ context }) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("\n" + "=".repeat(60));
    console.log("EXECUTION STATISTICS:");
    console.log("=".repeat(60));
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`🔄 Iterations: ${context.iteration + 1}`);
    console.log(`🔧 Tool Calls: ${context.toolCalls.length}`);
    console.log(
      `📊 Total Tokens: ${context.usage.totalTokens.toLocaleString()}`,
    );
    console.log(
      `   Input Tokens: ${context.usage.inputTokens.toLocaleString()}`,
    );
    console.log(
      `   Output Tokens: ${context.usage.outputTokens.toLocaleString()}`,
    );
    console.log(`   API Requests: ${context.usage.requests}`);

    const avgTokens = Math.round(
      context.usage.totalTokens / (context.iteration + 1),
    );
    console.log(`   Avg Tokens/Iteration: ${avgTokens.toLocaleString()}`);

    console.log(`💰 Cost Breakdown:`);
    console.log(
      `   Generation Cost: $${context.usage.cost.generation.toFixed(6)}`,
    );
    console.log(`   Platform Cost: $${context.usage.cost.platform.toFixed(6)}`);
    console.log(`   Total Cost: $${context.usage.cost.total.toFixed(6)}`);
  });

  // --- Execute Agent ---
  console.log("\n📝 Task: Analyze user activity and sales performance\n");

  try {
    const result = await agent.process(
      "Fetch user and sales data, calculate growth rates, and create a summary report",
    );

    console.log("\n" + "=".repeat(60));
    console.log("FINAL RESULT:");
    console.log("=".repeat(60));
    console.log(result);
  } catch (error) {
    console.error("\n❌ Error:", error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
