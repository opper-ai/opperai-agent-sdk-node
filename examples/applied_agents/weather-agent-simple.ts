/**
 * Simple Weather Agent Example
 *
 * Demonstrates a straightforward weather agent with tools.
 * Shows how to:
 * - Build an agent with domain-specific tools
 * - Use structured output schemas
 * - Monitor agent behavior with hooks
 *
 * Run with: pnpm example examples/applied_agents/weather-agent-simple.ts
 */

import { z } from "zod";
import {
  Agent,
  createFunctionTool,
  ToolResultFactory,
  HookEvents,
  type ToolExecutionContext,
} from "opper-agents";

// --- Output Schema ---

const WeatherResponseSchema = z.object({
  answer: z.string().describe("The natural language response to the user"),
  location: z.string().optional().describe("The location mentioned, if any"),
  weather_provided: z
    .boolean()
    .describe("Whether weather information was provided"),
});

type WeatherResponse = z.infer<typeof WeatherResponseSchema>;

// --- Weather Tools ---

const getWeatherTool = createFunctionTool(
  async (input: { location: string }, _context: ToolExecutionContext) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));

    const today = new Date().toISOString().split("T")[0] as string;

    const weatherData: Record<string, { date: string; weather: string }> = {
      "New York": { date: today, weather: "Sunny, 72°F, light winds" },
      London: { date: today, weather: "Cloudy, 15°C, light rain" },
      Tokyo: { date: today, weather: "Partly cloudy, 22°C, humid" },
      Paris: { date: today, weather: "Overcast, 18°C, gentle breeze" },
      Sydney: { date: today, weather: "Clear, 25°C, strong winds" },
    };

    const result = weatherData[input.location] ?? {
      date: today,
      weather: `Weather data not available for ${input.location}`,
    };

    return ToolResultFactory.success("get_weather", result);
  },
  {
    name: "get_weather",
    description: "Get current weather information for a location",
    schema: z.object({
      location: z.string().describe("The location to get weather for"),
    }),
  },
);

const getCurrentTimeTool = createFunctionTool(
  async (_input: { location: string }, _context: ToolExecutionContext) => {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    return ToolResultFactory.success("get_current_time", now);
  },
  {
    name: "get_current_time",
    description: "Get current time",
    schema: z.object({
      location: z.string().describe("The location to get time for"),
    }),
  },
);

// --- Main Demo Function ---

async function main(): Promise<void> {
  if (!process.env["OPPER_API_KEY"]) {
    console.error("❌ Set OPPER_API_KEY environment variable");
    process.exit(1);
  }

  console.log("🌤️  Simple Weather Agent Demo");
  console.log("=".repeat(50));

  // Create weather agent
  const agent = new Agent({
    name: "WeatherAgent",
    description: "A helpful assistant that provides weather information",
    instructions:
      "You are a helpful weather assistant. Respond naturally to user queries and provide weather information when asked. Always use tools to get real weather data.",
    tools: [getWeatherTool, getCurrentTimeTool],
    inputSchema: z.string(),
    outputSchema: WeatherResponseSchema,
    verbose: true,
    maxIterations: 10,
  });

  // Register hooks to monitor agent behavior
  agent.registerHook(HookEvents.AgentStart, () => {
    console.log("🤖 Agent started");
  });

  agent.registerHook(HookEvents.AfterTool, ({ tool, result }) => {
    console.log(`🔧 Tool executed: ${tool.name}`);
    if (result.success) {
      console.log(
        `   Output: ${JSON.stringify(result.output).slice(0, 100)}...`,
      );
    }
  });

  agent.registerHook(HookEvents.AgentEnd, ({ context }) => {
    console.log("✅ Agent completed");
    console.log(`   Iterations: ${context.iteration + 1}`);
  });

  // --- Test Cases ---

  console.log("\n--- Test 1: Weather Query ---");
  const result1 = await agent.process("What's the weather like in New York?");
  console.log("\n📤 Response:");
  console.log(`   Answer: ${result1.answer}`);
  console.log(`   Location: ${result1.location}`);
  console.log(`   Weather provided: ${result1.weather_provided}`);

  console.log("\n" + "=".repeat(50));
  console.log("\n--- Test 2: General Question ---");
  const result2 = await agent.process("Hello! How are you today?");
  console.log("\n📤 Response:");
  console.log(`   Answer: ${result2.answer}`);
  console.log(`   Weather provided: ${result2.weather_provided}`);

  console.log("\n" + "=".repeat(50));
  console.log("\n--- Test 3: Multiple Locations ---");
  const result3 = await agent.process(
    "Compare the weather in London and Tokyo",
  );
  console.log("\n📤 Response:");
  console.log(`   Answer: ${result3.answer}`);
  console.log(`   Weather provided: ${result3.weather_provided}`);

  console.log("\n" + "=".repeat(50));
  console.log("\n✅ Simple Weather Agent Demo Complete!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
