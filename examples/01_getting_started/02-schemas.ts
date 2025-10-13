/**
 * Example: Input and Output Schemas
 *
 * This example demonstrates:
 * - Defining structured input schema with Zod
 * - Defining structured output schema with Zod
 * - Type-safe agent inputs and outputs
 * - Simple single-tool agent pattern
 *
 * Run with: tsx examples/04-schemas.ts
 */

import { z } from "zod";
import {
  Agent,
  createFunctionTool,
  ToolResultFactory,
  type ToolExecutionContext,
} from "@opperai/agents";

// Define input schema
const WeatherRequestSchema = z.object({
  message: z
    .string()
    .describe("The description of the weather report to retrieve"),
});

type WeatherRequest = z.infer<typeof WeatherRequestSchema>;

// Define output schema
const WeatherReportSchema = z.object({
  location: z.string().describe("City and country"),
  temperature: z.number().describe("Temperature in Celsius"),
  conditions: z.string().describe("Weather conditions"),
  date: z.string().describe("Report date"),
});

type WeatherReport = z.infer<typeof WeatherReportSchema>;

// Create a simple weather lookup tool
const getWeatherTool = createFunctionTool(
  async (input: { city: string }, _context: ToolExecutionContext) => {
    console.log(`Tool called: get_weather(${input.city})`);

    // Simulate weather API lookup
    const weatherData = {
      location: `${input.city}, Country`,
      temperature: 22,
      conditions: "Partly cloudy",
    };

    return ToolResultFactory.success("get_weather", weatherData);
  },
  {
    name: "get_weather",
    description: "Get current weather for a city",
    schema: z.object({
      city: z.string().describe("City name"),
    }),
  },
);

async function main(): Promise<void> {
  // Create agent with input and output schemas
  const agent = new Agent<WeatherRequest, WeatherReport>({
    name: "WeatherAgent",
    description: "An agent that provides weather reports",
    instructions:
      "Use the get_weather tool to retrieve current conditions for the requested city and format a complete weather report",
    tools: [getWeatherTool],
    inputSchema: WeatherRequestSchema,
    outputSchema: WeatherReportSchema,
    maxIterations: 5,
    verbose: true,
    model: "gcp/gemini-flash-lite-latest",
  });

  // Input is validated against WeatherRequestSchema
  const request: WeatherRequest = {
    message: "What is the weather in Paris?",
  };

  console.log("Request:", request);
  console.log("");

  try {
    // Output is validated against WeatherReportSchema
    const report = await agent.process(request);

    console.log("");
    console.log("=".repeat(60));
    console.log("Weather Report:");
    console.log("=".repeat(60));
    console.log(`Location: ${report.location}`);
    console.log(`Temperature: ${report.temperature}C`);
    console.log(`Conditions: ${report.conditions}`);
    console.log(`Date: ${report.date}`);
  } catch (error) {
    console.error("Error:", error);
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
