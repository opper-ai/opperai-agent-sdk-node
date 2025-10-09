/**
 * Weather Conversation Agent Example
 *
 * Demonstrates a conversational agent with structured input/output schemas
 * and hooks for monitoring agent reasoning. Shows how to:
 * - Use conversation-style messages as input
 * - Structure agent responses
 * - Monitor agent thinking with hooks
 * - Build a natural conversational experience
 *
 * Run with: pnpm example examples/applied_agents/weather-conversation.ts
 */

import { z } from "zod";
import {
  Agent,
  createFunctionTool,
  ToolResultFactory,
  HookEvents,
  type ToolExecutionContext,
} from "@opperai/agent-ts";

// --- Input/Output Schemas ---

const ConversationMessageSchema = z.object({
  role: z
    .string()
    .describe("The role of the message sender (user, assistant, system)"),
  content: z.string().describe("The content of the message"),
});

const ConversationInputSchema = z.object({
  messages: z
    .array(ConversationMessageSchema)
    .describe("List of conversation messages"),
  location: z.string().optional().describe("Location for weather queries"),
});

const AgentMessageSchema = z.object({
  role: z
    .literal("assistant")
    .default("assistant")
    .describe("Role is always assistant"),
  content: z.string().describe("The agent's response to the user"),
});

type ConversationInput = z.infer<typeof ConversationInputSchema>;
type AgentMessage = z.infer<typeof AgentMessageSchema>;

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
  async (input: { location: string }, _context: ToolExecutionContext) => {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    return ToolResultFactory.success("get_current_time", now);
  },
  {
    name: "get_current_time",
    description: "Get current time information for a location",
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

  console.log("🌤️  Weather Conversation Agent Demo");
  console.log("=".repeat(50));

  // Create weather agent
  const agent = new Agent({
    name: "WeatherAgent",
    description:
      "A conversational agent that can provide weather information and engage in natural conversation.",
    instructions:
      "You are a helpful weather assistant. Respond naturally to user queries and provide weather information when asked.",
    tools: [getWeatherTool, getCurrentTimeTool],
    inputSchema: ConversationInputSchema,
    outputSchema: AgentMessageSchema,
    verbose: true,
    maxIterations: 10,
  });

  // Register hooks to monitor agent behavior
  agent.registerHook(HookEvents.AgentStart, ({ context }) => {
    console.log("🤖 Weather Agent started");
    console.log(`   Input: ${JSON.stringify(context.goal)}`);
  });

  agent.registerHook(HookEvents.ThinkEnd, ({ context }) => {
    const latest = context.executionHistory.at(-1);
    if (latest?.thought && typeof latest.thought === "object") {
      const thought = latest.thought as Record<string, unknown>;
      const reasoning = thought["reasoning"];
      if (typeof reasoning === "string") {
        console.log("💭 Agent thinking:");
        console.log(`   Reasoning: ${reasoning.slice(0, 100)}...`);
      }
    }
  });

  agent.registerHook(HookEvents.AgentEnd, ({ context, result }) => {
    console.log("✅ Agent completed");
    console.log(`   Iterations: ${context.iteration + 1}`);
    console.log(`   Result type: ${result ? typeof result : "undefined"}`);
  });

  // --- Test Cases ---

  console.log("\n--- Test Case 1: Weather Query ---");
  const conversation1: ConversationInput = {
    messages: [
      { role: "user", content: "What's the weather like in New York?" },
    ],
    location: "New York",
  };
  const result1 = await agent.process(conversation1);
  console.log("\n📤 Final Result 1:");
  console.log(`   Role: ${result1.role}`);
  console.log(`   Content: ${result1.content}`);

  console.log("\n" + "=".repeat(50));
  console.log("\n--- Test Case 2: General Conversation ---");
  const conversation2: ConversationInput = {
    messages: [{ role: "user", content: "Hello! How are you today?" }],
  };
  const result2 = await agent.process(conversation2);
  console.log("\n📤 Final Result 2:");
  console.log(`   Role: ${result2.role}`);
  console.log(`   Content: ${result2.content}`);

  console.log("\n" + "=".repeat(50));
  console.log("\n--- Test Case 3: Multi-turn Conversation ---");
  const conversation3: ConversationInput = {
    messages: [
      { role: "user", content: "I'm planning a trip to London next week." },
      {
        role: "assistant",
        content: "That sounds exciting! London is a great city to visit.",
      },
      { role: "user", content: "What should I expect for weather there?" },
    ],
    location: "London",
  };
  const result3 = await agent.process(conversation3);
  console.log("\n📤 Final Result 3:");
  console.log(`   Role: ${result3.role}`);
  console.log(`   Content: ${result3.content}`);

  console.log("\n" + "=".repeat(50));
  console.log("\n✅ Weather Conversation Demo Complete!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
