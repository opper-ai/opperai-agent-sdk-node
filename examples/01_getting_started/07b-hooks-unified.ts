/**
 * Example 7b: Unified Event System (agent.on vs registerHook)
 *
 * This example demonstrates that agent.on() and agent.registerHook() are now
 * equivalent - both use the unified hook system and ALL 17 events fire correctly.
 *
 * Previously, agent.on() only worked for streaming events. Now it works for all events:
 * - Agent lifecycle: agent:start, agent:end
 * - Loop iteration: loop:start, loop:end
 * - LLM interactions: llm:call, llm:response, think:end
 * - Tool execution: tool:before, tool:after, tool:error
 * - Memory operations: memory:read, memory:write, memory:error
 * - Streaming: stream:start, stream:chunk, stream:end, stream:error
 *
 * Run with: pnpm example examples/01_getting_started/07b-hooks-unified.ts
 */

import { z } from "zod";
import {
  Agent,
  HookEvents,
  createFunctionTool,
  ToolResultFactory,
  type ToolExecutionContext,
} from "@opperai/agents";

// Track which events fired
const eventsFired = {
  on: new Set<string>(),
  registerHook: new Set<string>(),
};

// Simple tool for triggering tool events
const calculatorTool = createFunctionTool(
  async (
    input: { a: number; b: number },
    _context: ToolExecutionContext,
  ): Promise<ReturnType<typeof ToolResultFactory.success>> => {
    return ToolResultFactory.success("calculator", input.a + input.b);
  },
  {
    name: "calculator",
    description: "Add two numbers",
    schema: z.object({
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
    }),
  },
);

async function main(): Promise<void> {
  console.log("🔗 Unified Event System Demonstration");
  console.log("=".repeat(60));
  console.log(
    "This example verifies that agent.on() works for ALL 17 hook events.\n",
  );

  const agent = new Agent({
    name: "UnifiedEventsDemo",
    description: "Demonstrates unified event system",
    instructions: `
You are a helpful assistant. Use the calculator tool to add numbers when asked.
Keep responses concise.
    `.trim(),
    tools: [calculatorTool],
    maxIterations: 5,
    enableMemory: true,
    model: "gcp/gemini-flash-lite-latest",
  });

  // All 17 event types
  const allEvents = [
    HookEvents.AgentStart,
    HookEvents.AgentEnd,
    HookEvents.LoopStart,
    HookEvents.LoopEnd,
    HookEvents.LlmCall,
    HookEvents.LlmResponse,
    HookEvents.ThinkEnd,
    HookEvents.BeforeTool,
    HookEvents.AfterTool,
    HookEvents.ToolError,
    HookEvents.MemoryRead,
    HookEvents.MemoryWrite,
    HookEvents.MemoryError,
    HookEvents.StreamStart,
    HookEvents.StreamChunk,
    HookEvents.StreamEnd,
    HookEvents.StreamError,
  ] as const;

  // Register handlers using agent.on() for ALL events
  console.log("📝 Registering handlers with agent.on() for all 17 events...");
  for (const event of allEvents) {
    agent.on(event, () => {
      eventsFired.on.add(event);
    });
  }

  // Also register with registerHook() to compare
  console.log(
    "📝 Registering handlers with agent.registerHook() for all 17 events...\n",
  );
  for (const event of allEvents) {
    agent.registerHook(event, () => {
      eventsFired.registerHook.add(event);
    });
  }

  // Execute agent
  console.log("🚀 Executing agent...\n");
  console.log("=".repeat(60));

  try {
    const result = await agent.process("What is 5 + 3?");

    console.log("\n" + "=".repeat(60));
    console.log("RESULT:", result);
    console.log("=".repeat(60));
  } catch (error) {
    console.error("Error:", error);
  }

  // Report which events fired
  console.log("\n📊 Event Firing Report");
  console.log("=".repeat(60));

  // Expected events for this execution (non-streaming, with tool call, no memory operations)
  const expectedEvents: Set<string> = new Set([
    HookEvents.AgentStart,
    HookEvents.AgentEnd,
    HookEvents.LoopStart,
    HookEvents.LoopEnd,
    HookEvents.LlmCall,
    HookEvents.LlmResponse,
    HookEvents.ThinkEnd,
    HookEvents.BeforeTool,
    HookEvents.AfterTool,
  ]);

  console.log("\nEvents fired via agent.on():");
  for (const event of allEvents) {
    const fired = eventsFired.on.has(event);
    const expected = expectedEvents.has(event);
    const status = fired ? "✅" : expected ? "❌ MISSING" : "⬜ (not triggered)";
    console.log(`  ${status} ${event}`);
  }

  console.log("\nEvents fired via registerHook():");
  for (const event of allEvents) {
    const fired = eventsFired.registerHook.has(event);
    const expected = expectedEvents.has(event);
    const status = fired ? "✅" : expected ? "❌ MISSING" : "⬜ (not triggered)";
    console.log(`  ${status} ${event}`);
  }

  // Verify on() and registerHook() received the same events
  console.log("\n🔍 Comparison:");
  const onSet = eventsFired.on;
  const hookSet = eventsFired.registerHook;

  const onlyInOn = [...onSet].filter((e) => !hookSet.has(e));
  const onlyInHook = [...hookSet].filter((e) => !onSet.has(e));

  if (onlyInOn.length === 0 && onlyInHook.length === 0) {
    console.log(
      "✅ agent.on() and registerHook() received IDENTICAL events!",
    );
    console.log(`   Total events fired: ${onSet.size}`);
  } else {
    console.log("❌ Mismatch detected:");
    if (onlyInOn.length > 0) {
      console.log(`   Only in on(): ${onlyInOn.join(", ")}`);
    }
    if (onlyInHook.length > 0) {
      console.log(`   Only in registerHook(): ${onlyInHook.join(", ")}`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📋 Summary:");
  console.log(`   - Total events registered: 17`);
  console.log(`   - Events fired via on(): ${eventsFired.on.size}`);
  console.log(`   - Events fired via registerHook(): ${eventsFired.registerHook.size}`);
  console.log("\nNote: Some events only fire in specific scenarios:");
  console.log("  - stream:* events only fire when enableStreaming: true");
  console.log("  - memory:read/write only fire when agent decides to use memory");
  console.log("  - tool:error only fires when a tool fails");
  console.log("  - memory:error only fires when memory operations fail");
  console.log("\n✅ Demonstration complete!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
