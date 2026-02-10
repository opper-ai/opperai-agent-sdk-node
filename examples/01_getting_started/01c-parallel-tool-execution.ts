/**
 * Example 1c: Parallel Tool Execution
 *
 * This example demonstrates:
 * - Using parallelToolExecution to run independent tools concurrently
 * - How parallel execution reduces total latency when tools are independent
 * - Comparing sequential vs parallel execution timing
 *
 * Run with: pnpm example examples/01_getting_started/01c-parallel-tool-execution.ts
 */

import { z } from "zod";
import {
  Agent,
  createFunctionTool,
  ToolResultFactory,
  type ToolExecutionContext,
} from "@opperai/agents";

// Simulate slow API calls (e.g., fetching data from different services)
const fetchWeatherTool = createFunctionTool(
  async (input: { city: string }, _context: ToolExecutionContext) => {
    console.log(`  🌤️  Fetching weather for ${input.city}...`);
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 500)); // Simulate API latency
    console.log(`  🌤️  Weather for ${input.city} done (${Date.now() - start}ms)`);
    return ToolResultFactory.success("fetch_weather", {
      city: input.city,
      temperature: 22,
      condition: "Sunny",
    });
  },
  {
    name: "fetch_weather",
    description: "Fetch current weather for a city",
    schema: z.object({
      city: z.string().describe("City name"),
    }),
  },
);

const fetchNewsTool = createFunctionTool(
  async (input: { topic: string }, _context: ToolExecutionContext) => {
    console.log(`  📰 Fetching news about ${input.topic}...`);
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 500)); // Simulate API latency
    console.log(`  📰 News about ${input.topic} done (${Date.now() - start}ms)`);
    return ToolResultFactory.success("fetch_news", {
      topic: input.topic,
      headlines: [
        `Breaking: New developments in ${input.topic}`,
        `${input.topic} trends upward this quarter`,
      ],
    });
  },
  {
    name: "fetch_news",
    description: "Fetch latest news headlines about a topic",
    schema: z.object({
      topic: z.string().describe("News topic to search for"),
    }),
  },
);

const fetchStockTool = createFunctionTool(
  async (input: { symbol: string }, _context: ToolExecutionContext) => {
    console.log(`  📈 Fetching stock price for ${input.symbol}...`);
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 500)); // Simulate API latency
    console.log(`  📈 Stock ${input.symbol} done (${Date.now() - start}ms)`);
    return ToolResultFactory.success("fetch_stock", {
      symbol: input.symbol,
      price: 185.42,
      change: "+1.2%",
    });
  },
  {
    name: "fetch_stock",
    description: "Fetch current stock price for a ticker symbol",
    schema: z.object({
      symbol: z.string().describe("Stock ticker symbol"),
    }),
  },
);

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Parallel Tool Execution Example");
  console.log("=".repeat(60) + "\n");

  // Create the agent with parallel tool execution enabled
  const agent = new Agent({
    name: "DashboardAgent",
    description: "An agent that gathers data from multiple sources",
    instructions: `You are a dashboard assistant. When asked for a briefing,
gather ALL the requested data using the available tools.
Use all relevant tools to collect comprehensive information.`,
    tools: [fetchWeatherTool, fetchNewsTool, fetchStockTool],
    parallelToolExecution: true, // Enable parallel execution
    maxIterations: 5,
    verbose: true,
    model: "gcp/gemini-flash-lite-latest",
  });

  agent.registerHook("agent:start", () => {
    console.log(`\nAgent starting...\n`);
  });

  agent.registerHook("agent:end", ({ context, error }) => {
    if (error) {
      console.log(`\nAgent failed:`, error);
    } else {
      console.log(`\nAgent completed successfully`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("Execution Stats:");
    console.log("=".repeat(60));
    console.log(`  Iterations: ${context.iteration + 1}`);
    console.log(`  Tool calls: ${context.toolCalls.length}`);
    console.log(`  Token usage:`, {
      requests: context.usage.requests,
      totalTokens: context.usage.totalTokens,
    });
  });

  // This task should trigger multiple tool calls that can run in parallel
  const task =
    "Give me a quick briefing: weather in Tokyo, latest tech news, and AAPL stock price.";

  console.log(`Task: ${task}\n`);

  try {
    const start = Date.now();
    const result = await agent.process(task);
    const elapsed = Date.now() - start;

    console.log("\n" + "=".repeat(60));
    console.log("Final Result:");
    console.log("=".repeat(60));
    console.log(result);
    console.log(`\nTotal time: ${elapsed}ms`);
    console.log(
      "Note: With 3 tools each taking ~500ms, sequential would be ~1500ms for tool execution alone.",
    );
  } catch (error) {
    console.error("\nError:", error);
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
