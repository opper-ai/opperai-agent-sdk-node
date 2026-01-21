/**
 * Example 1b: Agent with Tool Output Schemas and Examples
 *
 * This example demonstrates:
 * - Defining tools with outputSchema to describe what they return
 * - Providing examples to help the LLM understand tool behavior
 *
 * Run with: pnpm example examples/01_getting_started/01b-agent-with-tool-schemas.ts
 */

import { z } from "zod";
import { Agent, createFunctionTool } from "@opperai/agents";

// =============================================================================
// ADD TOOL
// =============================================================================

// Define schemas once - these are used for:
// 1. Runtime validation
// 2. JSON Schema generation for the LLM
const addInputSchema = z.object({
  a: z.number().describe("First number"),
  b: z.number().describe("Second number"),
});
const addOutputSchema = z.number().describe("The sum of the two numbers");

type AddInput = z.infer<typeof addInputSchema>;
type AddOutput = z.infer<typeof addOutputSchema>;

const addTool = createFunctionTool(
  (input: AddInput): AddOutput => {
    console.log(`  🔧 Tool called: add(${input.a}, ${input.b})`);
    return input.a + input.b;
  },
  {
    name: "add",
    description: "Add two numbers together",
    schema: addInputSchema,
    outputSchema: addOutputSchema,
    examples: [
      {
        input: { a: 2, b: 3 },
        output: 5,
        description: "Basic addition of positive numbers",
      },
      {
        input: { a: -5, b: 5 },
        output: 0,
        description: "Adding opposite numbers results in zero",
      },
    ],
  },
);

// =============================================================================
// MULTIPLY TOOL
// =============================================================================

const multiplyInputSchema = z.object({
  x: z.number().describe("First number"),
  y: z.number().describe("Second number"),
});
const multiplyOutputSchema = z
  .number()
  .describe("The product of the two numbers");

type MultiplyInput = z.infer<typeof multiplyInputSchema>;
type MultiplyOutput = z.infer<typeof multiplyOutputSchema>;

const multiplyTool = createFunctionTool(
  (input: MultiplyInput): MultiplyOutput => {
    console.log(`  🔧 Tool called: multiply(${input.x}, ${input.y})`);
    return input.x * input.y;
  },
  {
    name: "multiply",
    description: "Multiply two numbers together",
    schema: multiplyInputSchema,
    outputSchema: multiplyOutputSchema,
    examples: [
      {
        input: { x: 4, y: 5 },
        output: 20,
        description: "Multiplying positive numbers",
      },
      {
        input: { x: -3, y: 4 },
        output: -12,
        description: "Multiplying with a negative number",
      },
      {
        input: { x: 0, y: 100 },
        output: 0,
        description: "Multiplying by zero always returns zero",
      },
    ],
  },
);

// =============================================================================
// DIVIDE TOOL (with structured output)
// =============================================================================

const divideInputSchema = z.object({
  numerator: z.number().describe("Number to divide"),
  denominator: z.number().describe("Number to divide by"),
});
const divideOutputSchema = z.object({
  quotient: z.number().describe("The result of the division"),
  remainder: z.number().describe("The remainder after integer division"),
});

type DivideInput = z.infer<typeof divideInputSchema>;
type DivideOutput = z.infer<typeof divideOutputSchema>;

const divideTool = createFunctionTool(
  (input: DivideInput): DivideOutput => {
    console.log(
      `  🔧 Tool called: divide(${input.numerator}, ${input.denominator})`,
    );

    if (input.denominator === 0) {
      throw new Error("Cannot divide by zero");
    }

    const quotient = input.numerator / input.denominator;
    const remainder = input.numerator % input.denominator;
    return { quotient, remainder };
  },
  {
    name: "divide",
    description:
      "Divide first number by second number, returns quotient and remainder",
    schema: divideInputSchema,
    outputSchema: divideOutputSchema,
    examples: [
      {
        input: { numerator: 10, denominator: 3 },
        output: { quotient: 3.3333333333333335, remainder: 1 },
        description: "Division with remainder",
      },
      {
        input: { numerator: 15, denominator: 5 },
        output: { quotient: 3, remainder: 0 },
        description: "Clean division with no remainder",
      },
    ],
  },
);

async function main(): Promise<void> {
  // Create the agent with tools that have output schemas and examples
  const agent = new Agent({
    name: "MathAgent",
    description: "An agent that performs mathematical operations",
    instructions: `You are a math expert. Solve the problem using the available tools.
The tools provide detailed output schemas and examples to help you understand their behavior.`,
    tools: [addTool, multiplyTool, divideTool],
    maxIterations: 5,
    verbose: true,
    model: "gcp/gemini-flash-lite-latest",
  });

  // Register hooks to monitor execution
  agent.registerHook("agent:start", ({ context }) => {
    console.log(`🚀 Agent starting...`);
    console.log(`   Session: ${context.sessionId}`);
  });

  agent.registerHook("tool:after", ({ tool, result }) => {
    if (result.success) {
      console.log(
        `   ✅ Tool ${tool.name} succeeded with output:`,
        result.output,
      );
    } else {
      console.log(`   ❌ Tool ${tool.name} failed:`, result.error);
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

  // Run a task that uses multiple tools
  const task = "What is (5 + 3) * 2? Also, what is 17 divided by 5?";
  console.log(`📝 Task: ${task}\n`);

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
