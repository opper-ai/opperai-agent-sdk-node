/**
 * Example 7: Comprehensive Hook Demonstration
 *
 * This example demonstrates all available agent lifecycle hooks:
 * - agent:start / agent:end - Agent execution lifecycle
 * - loop:start / loop:end - Iteration boundaries
 * - llm:call / llm:response - LLM interactions
 * - think:end - Agent reasoning/thought process
 * - tool:before / tool:after / tool:error - Tool execution lifecycle
 * - memory:read / memory:write / memory:error - Memory operations
 *
 * Run with: pnpm example examples/01_getting_started/07_hooks.ts
 */

import { z } from "zod";
import {
  Agent,
  HookEvents,
  createFunctionTool,
  ToolResultFactory,
  type ToolExecutionContext,
} from "@opperai/agents";

// --- Simple Tools for Hook Demonstration ---

const searchTool = createFunctionTool(
  async (
    input: { query: string },
    _context: ToolExecutionContext,
  ): Promise<ReturnType<typeof ToolResultFactory.success>> => {
    console.log(`      [Tool Executing] search("${input.query}")`);

    // Simulate search results
    const results = [
      `Result 1 for "${input.query}"`,
      `Result 2 for "${input.query}"`,
      `Result 3 for "${input.query}"`,
    ];

    return ToolResultFactory.success("search", results);
  },
  {
    name: "search",
    description: "Search for information",
    schema: z.object({
      query: z.string().describe("The search query"),
    }),
  },
);

const analyzeTool = createFunctionTool(
  async (
    input: { data: string },
    _context: ToolExecutionContext,
  ): Promise<ReturnType<typeof ToolResultFactory.success>> => {
    console.log(`      [Tool Executing] analyze("${input.data}")`);

    const analysis = {
      length: input.data.length,
      wordCount: input.data.split(" ").length,
      sentiment: "positive",
    };

    return ToolResultFactory.success("analyze", analysis);
  },
  {
    name: "analyze",
    description: "Analyze text data",
    schema: z.object({
      data: z.string().describe("The data to analyze"),
    }),
  },
);

// A tool that may fail to demonstrate error hooks
const riskyTool = createFunctionTool(
  async (
    input: { shouldFail: boolean },
    _context: ToolExecutionContext,
  ): Promise<
    ReturnType<
      typeof ToolResultFactory.success | typeof ToolResultFactory.failure
    >
  > => {
    console.log(
      `      [Tool Executing] risky_operation(shouldFail=${input.shouldFail})`,
    );

    if (input.shouldFail) {
      return ToolResultFactory.failure(
        "risky_operation",
        new Error("Operation failed as expected"),
      );
    }

    return ToolResultFactory.success("risky_operation", "Success!");
  },
  {
    name: "risky_operation",
    description: "A risky operation that may fail",
    schema: z.object({
      shouldFail: z.boolean().describe("Whether to fail"),
    }),
  },
);

// --- Main Function ---

async function main(): Promise<void> {
  console.log("🎣 Comprehensive Hook Demonstration");
  console.log("=".repeat(60));
  console.log(
    "This example will log messages for every hook event during execution.\n",
  );

  const agent = new Agent({
    name: "HookDemoAgent",
    description: "Demonstrates all available lifecycle hooks",
    instructions: `
You are a helpful assistant that demonstrates hook events.
Use the available tools to search, analyze, and optionally test error handling.
Keep your responses concise.
    `.trim(),
    tools: [searchTool, analyzeTool, riskyTool],
    maxIterations: 5,
    enableMemory: true, // Enable memory to trigger memory hooks
    verbose: true,
    model: "gcp/gemini-flash-lite-latest",
  });

  // --- Agent Lifecycle Hooks ---

  agent.registerHook(HookEvents.AgentStart, ({ context }) => {
    console.log("\n🟢 [agent:start]");
    console.log(`   Session ID: ${context.sessionId}`);
    console.log(`   Parent Span ID: ${context.parentSpanId ?? "none"}`);
    console.log(`   Agent: ${context.agentName}`);
  });

  agent.registerHook(HookEvents.AgentEnd, ({ context, result, error }) => {
    console.log("\n🔴 [agent:end]");
    if (error) {
      console.log(`   Status: Failed`);
      console.log(`   Error: ${error}`);
    } else {
      console.log(`   Status: Success`);
      console.log(`   Result type: ${typeof result}`);
    }
    console.log(`   Total iterations: ${context.iteration + 1}`);
    console.log(`   Total tool calls: ${context.toolCalls.length}`);
  });

  // --- Loop/Iteration Hooks ---

  agent.registerHook(HookEvents.LoopStart, ({ context }) => {
    console.log(`\n🔄 [loop:start] Iteration ${context.iteration + 1}`);
  });

  agent.registerHook(HookEvents.LoopEnd, ({ context }) => {
    console.log(`   [loop:end] Iteration ${context.iteration + 1} completed`);
    console.log(
      `   Tokens used: ${context.usage.totalTokens.toLocaleString()}`,
    );
  });

  // --- LLM Interaction Hooks ---

  agent.registerHook(HookEvents.LlmCall, ({ context, callType }) => {
    console.log(`   🤖 [llm:call] Type: ${callType}`);
    console.log(
      `      Current usage: ${context.usage.inputTokens} in / ${context.usage.outputTokens} out`,
    );
  });

  agent.registerHook(HookEvents.LlmResponse, ({ context, callType }) => {
    console.log(`   ✅ [llm:response] Type: ${callType}`);
    console.log(
      `      Updated usage: ${context.usage.inputTokens} in / ${context.usage.outputTokens} out`,
    );
  });

  // --- Think/Reasoning Hook ---

  agent.registerHook(HookEvents.ThinkEnd, ({ context, thought }) => {
    console.log(`   💭 [think:end]`);
    if (thought && typeof thought === "object") {
      const thoughtObj = thought as Record<string, unknown>;
      if ("reasoning" in thoughtObj) {
        console.log(`      Reasoning: ${thoughtObj["reasoning"]}`);
      }
      if ("toolCalls" in thoughtObj) {
        const toolCalls = thoughtObj["toolCalls"] as unknown[];
        console.log(`      Planned tool calls: ${toolCalls.length}`);
      }
    }
  });

  // --- Tool Execution Hooks ---

  agent.registerHook(HookEvents.BeforeTool, ({ tool, input, toolCallId }) => {
    console.log(`   🔧 [tool:before] ${tool.name}`);
    console.log(`      Tool Call ID: ${toolCallId}`);
    console.log(`      Input: ${JSON.stringify(input)}`);
  });

  agent.registerHook(HookEvents.AfterTool, ({ tool, result, record }) => {
    console.log(`   ✅ [tool:after] ${tool.name}`);
    console.log(`      Record ID: ${record.id}`);
    console.log(`      Success: ${result.success}`);
    const duration = record.finishedAt
      ? record.finishedAt - record.startedAt
      : 0;
    console.log(`      Duration: ${duration}ms`);
    if (result.success) {
      console.log(
        `      Output: ${JSON.stringify(result.output).substring(0, 100)}...`,
      );
    }
  });

  agent.registerHook(HookEvents.ToolError, ({ toolName, error, toolCallId }) => {
    console.log(`   ❌ [tool:error] ${toolName}`);
    console.log(`      Tool Call ID: ${toolCallId}`);
    console.log(`      Error: ${error}`);
  });

  // --- Memory Hooks ---

  agent.registerHook(HookEvents.MemoryRead, ({ context, key, value }) => {
    console.log(`   📖 [memory:read]`);
    console.log(`      Key: ${key}`);
    console.log(`      Has value: ${value !== undefined}`);
  });

  agent.registerHook(HookEvents.MemoryWrite, ({ context, key, value }) => {
    console.log(`   💾 [memory:write]`);
    console.log(`      Key: ${key}`);
    console.log(
      `      Value: ${JSON.stringify(value).substring(0, 50)}${JSON.stringify(value).length > 50 ? "..." : ""}`,
    );
  });

  agent.registerHook(HookEvents.MemoryError, ({ operation, error }) => {
    console.log(`   ❌ [memory:error]`);
    console.log(`      Operation: ${operation}`);
    console.log(`      Error: ${error}`);
  });

  // --- Execute Agent ---

  console.log(
    "\n📝 Task: Search for 'TypeScript hooks' and analyze the results\n",
  );
  console.log("=".repeat(60));

  try {
    const result = await agent.process(
      "Search for 'TypeScript hooks' and analyze the first result",
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

  console.log("\n" + "=".repeat(60));
  console.log("✅ Hook demonstration complete!");
  console.log(
    "Review the logs above to see when each hook was triggered during execution.",
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
