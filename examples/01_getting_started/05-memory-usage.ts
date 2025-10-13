/**
 * Example 5: Memory Usage
 *
 * This example demonstrates:
 * - Enabling memory for persistent storage
 * - Writing and reading memory within a single process call
 * - Memory persistence across multiple process calls
 *
 * Run with: tsx examples/05-memory-usage.ts
 */

import { z } from "zod";
import {
  Agent,
  createFunctionTool,
  ToolResultFactory,
  type ToolExecutionContext,
} from "opper-agents";

// Simple tool to calculate budget
const calculateBudgetTool = createFunctionTool(
  async (
    input: { amount: number; category: string },
    _context: ToolExecutionContext,
  ) => {
    console.log(
      `  Tool called: calculateBudget(${input.amount}, ${input.category})`,
    );
    return ToolResultFactory.success("calculateBudget", {
      amount: input.amount,
      category: input.category,
      calculated: true,
    });
  },
  {
    name: "calculateBudget",
    description: "Calculate budget for a category",
    schema: z.object({
      amount: z.number().describe("Budget amount"),
      category: z.string().describe("Budget category"),
    }),
  },
);

async function example1_MemoryWithinSingleCall(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("Example 1: Memory Read/Write in Single Process Call");
  console.log("=".repeat(60) + "\n");

  const agent = new Agent({
    name: "BudgetAgent",
    description: "An agent that manages budget information",
    instructions: `You help manage budget information. Store important budget data in memory for later reference.`,
    tools: [calculateBudgetTool],
    enableMemory: true, // Enable memory subsystem
    maxIterations: 10,
    verbose: true,
    model: "gcp/gemini-flash-lite-latest",
  });

  // Register memory hooks to see what's happening
  agent.registerHook("memory:write", ({ key, value }) => {
    console.log(`  Memory write: ${key} =`, value);
  });

  agent.registerHook("memory:read", ({ key, value }) => {
    console.log(`  Memory read: ${key} =`, value);
  });

  const task = `Calculate a monthly budget of $5000 for groceries.
Store this budget in memory with key "monthly_grocery_budget".
Then read it back and confirm the stored value.`;

  console.log(`Task: ${task}\n`);

  try {
    const result = await agent.process(task);

    console.log("\n" + "=".repeat(60));
    console.log("Result:");
    console.log("=".repeat(60));
    console.log(result);
  } catch (error) {
    console.error("\nError:", error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
  }
}

async function example2_MemoryAcrossMultipleCalls(): Promise<void> {
  console.log("\n\n" + "=".repeat(60));
  console.log("Example 2: Memory Persistence Across Process Calls");
  console.log("=".repeat(60) + "\n");

  // Create agent with memory enabled
  const agent = new Agent({
    name: "PreferenceAgent",
    description: "An agent that remembers user preferences",
    instructions: `You remember user preferences. When told to remember something, store it in memory. When asked to recall, read from memory.`,
    tools: [],
    enableMemory: true,
    maxIterations: 5,
    verbose: true,
    model: "gcp/gemini-flash-lite-latest",
  });

  // Register memory hooks
  agent.registerHook("memory:write", ({ key, value }) => {
    console.log(`  Memory write: ${key} =`, value);
  });

  agent.registerHook("memory:read", ({ key, value }) => {
    console.log(`  Memory read: ${key} =`, value);
  });

  // First process call: Store user preferences
  console.log("--- First Process Call: Storing Preferences ---\n");

  const task1 = `Remember that my favorite color is blue and my favorite number is 42.
Store these as "favorite_color" and "favorite_number" in memory.`;

  console.log(`Task: ${task1}\n`);

  try {
    const result1 = await agent.process(task1);

    console.log("\n" + "=".repeat(60));
    console.log("Result from first call:");
    console.log("=".repeat(60));
    console.log(result1);
  } catch (error) {
    console.error("\nError:", error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
  }

  // Wait a moment to make it clear these are separate calls
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Second process call: Recall preferences (memory should persist)
  console.log("\n\n--- Second Process Call: Recalling Preferences ---\n");

  const task2 = `What are my favorite color and favorite number?
Read them from memory and tell me.`;

  console.log(`Task: ${task2}\n`);

  try {
    const result2 = await agent.process(task2);

    console.log("\n" + "=".repeat(60));
    console.log("Result from second call:");
    console.log("=".repeat(60));
    console.log(result2);

    console.log("\n" + "=".repeat(60));
    console.log("Memory persisted across process calls!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\nError:", error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
  }
}

async function main(): Promise<void> {
  console.log("\nMemory Usage Examples");
  console.log("====================\n");

  // Run example 1: Memory within single call
  await example1_MemoryWithinSingleCall();

  // Run example 2: Memory across multiple calls
  await example2_MemoryAcrossMultipleCalls();

  console.log("\n\nAll examples completed successfully!");
}

// Run the examples
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
