/**
 * Example 1: Agent with Tools
 *
 * This example demonstrates:
 * - Creating a simple agent with tools
 * - Processing a task with the agent
 * - Accessing execution context and stats
 *
 * Run with: pnpm example examples/01_getting_started/01-agent-with-tool.ts
 */

import { z } from "zod";
import {
  Agent,
  createFunctionTool,
  ToolResultFactory,
  type ToolExecutionContext,
} from "@opperai/agent-ts";

// Define strongly-typed math tools using the factory pattern
// NOTE: createFunctionTool takes (fn, options) - function first!
const addTool = createFunctionTool(
  async (input: { a: number; b: number }, _context: ToolExecutionContext) => {
    console.log(`  🔧 Tool called: add(${input.a}, ${input.b})`);
    const result = input.a + input.b;
    return ToolResultFactory.success("add", result);
  },
  {
    name: "add",
    description: "Add two numbers together",
    schema: z.object({
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
    }),
  },
);

const multiplyTool = createFunctionTool(
  async (input: { x: number; y: number }, _context: ToolExecutionContext) => {
    console.log(`  🔧 Tool called: multiply(${input.x}, ${input.y})`);
    const result = input.x * input.y;
    return ToolResultFactory.success("multiply", result);
  },
  {
    name: "multiply",
    description: "Multiply two numbers together",
    schema: z.object({
      x: z.number().describe("First number"),
      y: z.number().describe("Second number"),
    }),
  },
);

const divideTool = createFunctionTool(
  async (
    input: { numerator: number; denominator: number },
    _context: ToolExecutionContext,
  ) => {
    console.log(
      `  🔧 Tool called: divide(${input.numerator}, ${input.denominator})`,
    );

    if (input.denominator === 0) {
      return ToolResultFactory.failure(
        "divide",
        new Error("Cannot divide by zero"),
      );
    }

    const result = input.numerator / input.denominator;
    return ToolResultFactory.success("divide", result);
  },
  {
    name: "divide",
    description: "Divide first number by second number",
    schema: z.object({
      numerator: z.number().describe("Number to divide"),
      denominator: z.number().describe("Number to divide by"),
    }),
  },
);

async function main(): Promise<void> {
  // Create the agent with strongly-typed configuration
  const agent = new Agent({
    name: "MathAgent",
    description: "An agent that performs mathematical operations",
    instructions: `You are a math expert. Solve the problem using the available tools.`,
    tools: [addTool, multiplyTool, divideTool],
    maxIterations: 5,
    verbose: true,
    model: "gcp/gemini-flash-lite-latest",
  });

  // Register hooks to monitor execution
  agent.registerHook("agent:start", ({ context }) => {
    console.log(` Agent starting...`);
    console.log(`   Session: ${context.sessionId}`);
  });

  agent.registerHook("tool:after", ({ tool, result }) => {
    if (result.success) {
      console.log(
        `    Tool ${tool.name} succeeded with output:`,
        result.output,
      );
    } else {
      console.log(`    Tool ${tool.name} failed:`, result.error);
    }
  });

  agent.registerHook("agent:end", ({ context, result, error }) => {
    if (error) {
      console.log(`\n Agent failed:`, error);
    } else {
      console.log(`\n Agent completed successfully`);
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

  // Run a simple task
  const task = "What is (5 + 3) * 2?";
  console.log(`📝 Task: ${task}\n`);

  try {
    const result = await agent.process(task);

    console.log("\n" + "=".repeat(60));
    console.log("Final Result:");
    console.log("=".repeat(60));
    console.log(result);
  } catch (error) {
    console.error("\n Error:", error);
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
