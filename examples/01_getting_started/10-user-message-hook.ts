/**
 * Example 10: User Message Hook
 *
 * This example demonstrates:
 * - Using the THINK_END hook to access userMessage
 * - Displaying real-time status updates to users
 * - The agent's user-friendly progress messages during execution
 *
 * The userMessage field provides a brief, user-friendly status that the agent
 * generates on each iteration. This is useful for showing progress in UIs,
 * logging, or any scenario where you want to communicate status to end users.
 *
 * Run with: pnpm example examples/01_getting_started/10-user-message-hook.ts
 */

import { z } from "zod";
import {
  Agent,
  HookEvents,
  createFunctionTool,
  ToolResultFactory,
} from "@opperai/agents";

// Check for API key upfront
if (!process.env["OPPER_API_KEY"]) {
  console.error("Error: OPPER_API_KEY environment variable not set");
  console.error("\nPlease set it with:");
  console.error("  export OPPER_API_KEY='your-key-here'");
  process.exit(1);
}

// ============================================================================
// TOOLS
// ============================================================================

/**
 * Simulates fetching weather data
 */
const getWeatherTool = createFunctionTool(
  async (input: { city: string }) => {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    const weatherData: Record<string, { temp: number; condition: string }> = {
      london: { temp: 12, condition: "cloudy" },
      paris: { temp: 18, condition: "sunny" },
      tokyo: { temp: 22, condition: "partly cloudy" },
      "new york": { temp: 15, condition: "rainy" },
    };

    const cityLower = input.city.toLowerCase();
    const data = weatherData[cityLower];

    if (data) {
      return ToolResultFactory.success(
        "get_weather",
        `Weather in ${input.city}: ${data.temp}°C, ${data.condition}`,
      );
    }

    return ToolResultFactory.success(
      "get_weather",
      `Weather data not available for ${input.city}`,
    );
  },
  {
    name: "get_weather",
    description: "Get current weather for a city",
    schema: z.object({
      city: z.string().describe("The city to get weather for"),
    }),
  },
);

/**
 * Simulates fetching a forecast
 */
const getForecastTool = createFunctionTool(
  async (input: { city: string; days: number }) => {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    return ToolResultFactory.success(
      "get_forecast",
      `${input.days}-day forecast for ${input.city}: Mix of sun and clouds, temperatures ranging from 10-20°C`,
    );
  },
  {
    name: "get_forecast",
    description: "Get weather forecast for a city",
    schema: z.object({
      city: z.string().describe("The city to get forecast for"),
      days: z.number().describe("Number of days to forecast"),
    }),
  },
);

// ============================================================================
// AGENT
// ============================================================================

const agent = new Agent({
  name: "WeatherAgent",
  description: "A helpful weather assistant",
  instructions: `You are a weather assistant. Help users get weather information.
When asked about weather, use the available tools to fetch data.
Provide helpful summaries based on the data you retrieve.`,
  tools: [getWeatherTool, getForecastTool],
  model: "gcp/gemini-flash-lite-latest",
  maxIterations: 5,
});

// ============================================================================
// HOOK: Access userMessage on each think step
// ============================================================================

// Define the expected shape of the thought object
interface ThinkEndThought {
  reasoning: string;
  userMessage: string;
}

// Register the THINK_END hook to receive status updates
agent.registerHook(HookEvents.ThinkEnd, ({ thought }) => {
  const typedThought = thought as ThinkEndThought;

  // Display the user-friendly message from the agent
  console.log(`\n  Status: ${typedThought.userMessage}`);
});

// Also track tool calls for visibility
agent.registerHook(HookEvents.AfterTool, ({ tool, result }) => {
  const resultObj = result as { success: boolean; output?: unknown };
  if (resultObj.success) {
    console.log(`  [${tool.name}] completed`);
  }
});

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log("Weather Agent with User Message Hook");
  console.log("=".repeat(50));
  console.log("\nThis example shows how to access the agent's userMessage");
  console.log("field via the THINK_END hook for real-time status updates.\n");

  const query =
    "What's the weather like in London and Paris? Also get a 3-day forecast for London.";
  console.log(`Query: ${query}`);
  console.log("-".repeat(50));

  const result = await agent.process(query);

  console.log("\n" + "=".repeat(50));
  console.log("Final Result:");
  console.log("=".repeat(50));
  console.log(result);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
