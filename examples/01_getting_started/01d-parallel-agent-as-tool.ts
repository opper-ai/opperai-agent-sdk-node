/**
 * Example 1d: Parallel Agent-as-Tool Execution
 *
 * This example demonstrates:
 * - Composing specialized agents using asTool()
 * - Running multiple sub-agents in parallel with parallelToolExecution
 * - How parallel execution speeds up multi-agent coordination
 *
 * Run with: pnpm example examples/01_getting_started/01d-parallel-agent-as-tool.ts
 */

import { Agent } from "@opperai/agents";

// ============================================================================
// Specialized sub-agents (each handles one domain)
// ============================================================================

const weatherAgent = new Agent({
  name: "WeatherAgent",
  description: "Provides weather information for a given location",
  instructions: `You are a weather expert. When asked about the weather:
1. Provide a realistic weather description for the location
2. Include temperature, conditions, and any notable details
Keep responses concise (under 50 words).`,
  maxIterations: 2,
  model: "gcp/gemini-flash-lite-latest",
});

const financeAgent = new Agent({
  name: "FinanceAgent",
  description: "Provides stock market and financial information",
  instructions: `You are a finance expert. When asked about stocks or markets:
1. Provide a brief market summary or stock info
2. Include a realistic price and trend
Keep responses concise (under 50 words).`,
  maxIterations: 2,
  model: "gcp/gemini-flash-lite-latest",
});

const newsAgent = new Agent({
  name: "NewsAgent",
  description: "Provides latest news headlines on any topic",
  instructions: `You are a news analyst. When asked about news:
1. Provide 2-3 realistic headline summaries
2. Keep it brief and informative
Keep responses concise (under 50 words).`,
  maxIterations: 2,
  model: "gcp/gemini-flash-lite-latest",
});

// ============================================================================
// Coordinator agent: runs sub-agents in parallel
// ============================================================================

const coordinator = new Agent({
  name: "BriefingCoordinator",
  description: "Coordinates multiple specialist agents to produce a briefing",
  instructions: `You are a briefing coordinator. When the user asks for a briefing:
- Delegate to ALL specialist agents simultaneously to gather information
- Use weather_agent for weather, finance_agent for markets, news_agent for news
- Combine their outputs into a concise executive briefing`,
  tools: [
    weatherAgent.asTool("weather_agent", "Get weather for a location"),
    financeAgent.asTool("finance_agent", "Get stock/market information"),
    newsAgent.asTool("news_agent", "Get latest news on a topic"),
  ],
  parallelToolExecution: true,
  maxIterations: 5,
  verbose: true,
  model: "gcp/gemini-flash-lite-latest",
});

// ============================================================================
// Run
// ============================================================================

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Parallel Agent-as-Tool Example");
  console.log("=".repeat(60) + "\n");

  coordinator.registerHook("agent:end", ({ context }) => {
    console.log("\n" + "=".repeat(60));
    console.log("Execution Stats:");
    console.log("=".repeat(60));
    console.log(`  Iterations: ${context.iteration + 1}`);
    console.log(`  Tool calls: ${context.toolCalls.length}`);
    console.log(`  Token usage:`, {
      requests: context.usage.requests,
      totalTokens: context.usage.totalTokens,
    });

    // Show per-agent breakdown
    if (context.usage.breakdown) {
      console.log("  Per-agent breakdown:");
      for (const [name, stats] of Object.entries(context.usage.breakdown)) {
        const s = stats as { totalTokens: number };
        console.log(`    ${name}: ${s.totalTokens} tokens`);
      }
    }
  });

  const task =
    "Give me a morning briefing: weather in San Francisco, how's the S&P 500 doing, and top AI news.";

  console.log(`Task: ${task}\n`);

  try {
    const start = Date.now();
    const { result, usage } = await coordinator.run(task);
    const elapsed = Date.now() - start;

    console.log("\n" + "=".repeat(60));
    console.log("Final Briefing:");
    console.log("=".repeat(60));
    console.log(result);
    console.log(`\nTotal time: ${elapsed}ms`);
    console.log(
      "Note: All 3 sub-agents ran in parallel, each making their own LLM calls.",
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
