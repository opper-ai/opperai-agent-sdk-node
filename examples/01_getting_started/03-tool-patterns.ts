/**
 * Example 3: Tool Definition Patterns
 *
 * This example demonstrates different ways to define tools:
 * 1. Using the @tool decorator (class-based, declarative)
 * 2. Using createFunctionTool (functional, explicit)
 * 3. Using both patterns together in a single agent
 *
 * Run with: tsx examples/03-tool-patterns.ts
 */

import { z } from "zod";
import {
  Agent,
  createFunctionTool,
  tool,
  extractTools,
  ToolResultFactory,
  type ToolExecutionContext,
} from "@opperai/agent-ts";

// ============================================================================
// Pattern 1: Decorator-based tools (class methods with @tool decorator)
// ============================================================================

/**
 * Define tools as a class with @tool decorators
 * Great for organizing related tools together
 */
class WeatherTools {
  /**
   * Get current weather for a location
   */
  @tool({
    name: "get_weather",
    description: "Get current weather information for a specific location",
    schema: z.object({
      location: z.string().describe("City name or location"),
      units: z.enum(["celsius", "fahrenheit"]).default("celsius"),
    }),
  })
  async getWeather(
    input: { location: string; units?: "celsius" | "fahrenheit" },
    _context: ToolExecutionContext,
  ) {
    console.log(
      `  🌤️  Fetching weather for ${input.location} in ${input.units || "celsius"}`,
    );

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Mock weather data
    const temp = input.units === "fahrenheit" ? 72 : 22;
    return {
      location: input.location,
      temperature: temp,
      units: input.units || "celsius",
      condition: "Partly Cloudy",
      humidity: 65,
    };
  }

  /**
   * Get weather forecast
   */
  @tool({
    name: "get_forecast",
    description: "Get weather forecast for the next few days",
    schema: z.object({
      location: z.string().describe("City name or location"),
      days: z
        .number()
        .int()
        .min(1)
        .max(7)
        .default(3)
        .describe("Number of days (1-7)"),
    }),
  })
  async getForecast(
    input: { location: string; days?: number },
    _context: ToolExecutionContext,
  ) {
    console.log(
      `  📅 Fetching ${input.days || 3}-day forecast for ${input.location}`,
    );

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Mock forecast data
    const days = input.days || 3;
    const forecast = Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      high: 20 + Math.floor(Math.random() * 10),
      low: 15 + Math.floor(Math.random() * 5),
      condition: ["Sunny", "Cloudy", "Rainy"][i % 3],
    }));

    return {
      location: input.location,
      forecast,
    };
  }
}

// ============================================================================
// Pattern 2: Function-based tools (using createFunctionTool)
// ============================================================================

/**
 * Convert temperature between units
 * Defined as a standalone function wrapped with createFunctionTool
 */
const convertTemperatureTool = createFunctionTool(
  async (
    input: { temperature: number; from: string; to: string },
    _context: ToolExecutionContext,
  ) => {
    console.log(
      `  🌡️  Converting ${input.temperature}°${input.from} to ${input.to}`,
    );

    let result: number;

    // Convert to Celsius first
    let celsius = input.temperature;
    if (input.from === "fahrenheit") {
      celsius = ((input.temperature - 32) * 5) / 9;
    } else if (input.from === "kelvin") {
      celsius = input.temperature - 273.15;
    }

    // Convert from Celsius to target
    if (input.to === "fahrenheit") {
      result = (celsius * 9) / 5 + 32;
    } else if (input.to === "kelvin") {
      result = celsius + 273.15;
    } else {
      result = celsius;
    }

    return ToolResultFactory.success("convert_temperature", {
      original: {
        value: input.temperature,
        unit: input.from,
      },
      converted: {
        value: Math.round(result * 100) / 100,
        unit: input.to,
      },
    });
  },
  {
    name: "convert_temperature",
    description: "Convert temperature between Celsius, Fahrenheit, and Kelvin",
    schema: z.object({
      temperature: z.number().describe("Temperature value to convert"),
      from: z.enum(["celsius", "fahrenheit", "kelvin"]).describe("Source unit"),
      to: z.enum(["celsius", "fahrenheit", "kelvin"]).describe("Target unit"),
    }),
  },
);

/**
 * Get timezone information
 * Another standalone function-based tool
 */
const getTimezoneTool = createFunctionTool(
  async (input: { location: string }, _context: ToolExecutionContext) => {
    console.log(`  🕒 Getting timezone info for ${input.location}`);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Mock timezone data
    const timezones: Record<
      string,
      { timezone: string; offset: string; currentTime: string }
    > = {
      "New York": {
        timezone: "America/New_York",
        offset: "UTC-5",
        currentTime: "10:30 AM",
      },
      London: {
        timezone: "Europe/London",
        offset: "UTC+0",
        currentTime: "3:30 PM",
      },
      Tokyo: {
        timezone: "Asia/Tokyo",
        offset: "UTC+9",
        currentTime: "12:30 AM",
      },
      Sydney: {
        timezone: "Australia/Sydney",
        offset: "UTC+11",
        currentTime: "2:30 AM",
      },
    };

    const info = timezones[input.location] || {
      timezone: "Unknown",
      offset: "Unknown",
      currentTime: "Unknown",
    };

    return ToolResultFactory.success("get_timezone", {
      location: input.location,
      ...info,
    });
  },
  {
    name: "get_timezone",
    description: "Get timezone information and current time for a location",
    schema: z.object({
      location: z.string().describe("City name or location"),
    }),
  },
);

// ============================================================================
// Main Example: Combine both patterns in a single agent
// ============================================================================

async function main(): Promise<void> {
  // Check for API key
  if (!process.env["OPPER_API_KEY"]) {
    console.error("❌ Error: OPPER_API_KEY environment variable not set");
    console.error("\nPlease set it with:");
    console.error("  export OPPER_API_KEY='your-key-here'");
    process.exit(1);
  }

  console.log("✅ OPPER_API_KEY found\n");
  console.log("=".repeat(60));
  console.log("Tool Patterns Example: Decorator + Function Tools");
  console.log("=".repeat(60) + "\n");

  // Extract decorator-based tools from the class
  const weatherTools = extractTools(new WeatherTools());

  console.log("📦 Extracted tools from class:");
  weatherTools.forEach((tool) => {
    console.log(`   - ${tool.name}: ${tool.description}`);
  });

  console.log("\n📦 Function-based tools:");
  console.log(
    `   - ${convertTemperatureTool.name}: ${convertTemperatureTool.description}`,
  );
  console.log(`   - ${getTimezoneTool.name}: ${getTimezoneTool.description}`);

  // Create agent combining both decorator-based and function-based tools
  const agent = new Agent({
    name: "WeatherAssistant",
    description:
      "An assistant that provides weather information and related conversions",
    instructions: `You are a helpful weather assistant. You can:
1. Get current weather for any location
2. Get weather forecasts
3. Convert temperatures between units
4. Provide timezone information

Always be friendly and provide complete information.`,
    tools: [
      ...weatherTools, // Decorator-based tools
      convertTemperatureTool, // Function-based tool
      getTimezoneTool, // Function-based tool
    ],
    maxIterations: 5,
    verbose: true,
    model: "openai/gpt-4o-mini",
  });

  // Register hooks to monitor execution
  agent.registerHook("agent:start", ({ context }) => {
    console.log(`\n🚀 Agent starting...`);
    console.log(`   Session: ${context.sessionId}`);
  });

  agent.registerHook("tool:after", ({ tool, result }) => {
    if (result.success) {
      console.log(`   ✅ ${tool.name} succeeded`);
    } else {
      console.log(`   ❌ ${tool.name} failed:`, result.error);
    }
  });

  agent.registerHook("agent:end", ({ context, error }) => {
    if (error) {
      console.log(`\n❌ Agent failed:`, error);
    } else {
      console.log(`\n✅ Agent completed successfully`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("Execution Stats:");
    console.log("=".repeat(60));
    console.log(`  Iterations: ${context.iteration + 1}`);
    console.log(`  Tool calls: ${context.toolCalls.length}`);
    console.log(`  Token usage:`, {
      requests: context.usage.requests,
      inputTokens: context.usage.inputTokens,
      outputTokens: context.usage.outputTokens,
      totalTokens: context.usage.totalTokens,
    });
  });

  // Test the agent with a complex request
  const task =
    "What's the weather like in Tokyo? Also, if it's 72°F in New York, what is that in Celsius? And what time is it in London?";

  console.log(`\n📝 Task: ${task}\n`);

  try {
    const result = await agent.process(task);

    console.log("\n" + "=".repeat(60));
    console.log("Final Result:");
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

// Run the example
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
