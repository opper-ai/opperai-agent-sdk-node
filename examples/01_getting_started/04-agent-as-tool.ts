/**
 * Example 4: Agent as Tool Pattern
 *
 * This example demonstrates:
 * - Creating specialized agents
 * - Using agents as tools in other agents (agent composition)
 * - Two approaches: using asTool() and manual tool wrapping
 * - Building coordinator agents that delegate to specialists
 *
 * Run with: tsx examples/04-agent-as-tool.ts
 */

import { z } from "zod";
import {
  Agent,
  createFunctionTool,
  ToolResultFactory,
  type ToolExecutionContext,
} from "@opperai/agent-ts";

// Check for API key upfront
if (!process.env["OPPER_API_KEY"]) {
  console.error("❌ Error: OPPER_API_KEY environment variable not set");
  console.error("\nPlease set it with:");
  console.error("  export OPPER_API_KEY='your-key-here'");
  process.exit(1);
}

// ============================================================================
// SPECIALIZED AGENTS
// ============================================================================

/**
 * Math Agent - Handles all mathematical operations
 */
const mathAgent = new Agent({
  name: "MathAgent",
  description: "Performs mathematical calculations and solves equations",
  instructions: `You are a math expert. When given a calculation request:
1. Perform the calculation accurately
2. Show your reasoning briefly
3. Return the numeric result
Be precise and concise.`,
  maxIterations: 3,
  model: "gcp/gemini-flash-lite-latest",
});

/**
 * Research Agent - Handles explanations and research
 */
const researchAgent = new Agent({
  name: "ResearchAgent",
  description: "Researches topics and provides clear explanations",
  instructions: `You are a research expert. When given a topic:
1. Provide a clear, concise explanation
2. Include relevant details and context
3. Make it accessible and informative
Keep responses focused and under 150 words.`,
  maxIterations: 3,
  model: "gcp/gemini-flash-lite-latest",
});

// ============================================================================
// APPROACH 1: Using asTool() - Simple and Recommended
// ============================================================================

console.log("\n" + "=".repeat(70));
console.log("APPROACH 1: Using asTool() - Simple and Recommended");
console.log("=".repeat(70) + "\n");

/**
 * Coordinator V1: Uses the built-in asTool() method
 * This is the simplest way to compose agents
 */
const coordinatorV1 = new Agent({
  name: "CoordinatorV1",
  description: "Coordinates between specialized agents using asTool()",
  instructions: `You help users solve problems by delegating to specialized agents:
- Use MathAgent for any calculations or mathematical operations
- Use ResearchAgent for explanations, definitions, or research

Delegate appropriately and combine the results into a coherent response.`,
  tools: [
    mathAgent.asTool("math_agent", "Calculate mathematical expressions"),
    researchAgent.asTool("research_agent", "Research and explain concepts"),
  ],
  maxIterations: 5,
  verbose: true,
  model: "gcp/gemini-flash-lite-latest",
});

// ============================================================================
// APPROACH 2: Manual Tool Wrapping - More Control
// ============================================================================

console.log("\n" + "=".repeat(70));
console.log("APPROACH 2: Manual Tool Wrapping - More Control");
console.log("=".repeat(70) + "\n");

/**
 * Manual wrapper for math calculations
 * Gives you control over the tool interface
 * NOTE: createFunctionTool takes (fn, options) - function first!
 */
const calculateTool = createFunctionTool(
  async (input: { expression: string }, context: ToolExecutionContext) => {
    try {
      console.log(`  🔧 Delegating to MathAgent: "${input.expression}"`);
      const result = await mathAgent.process(
        input.expression,
        context.spanId ?? context.agentContext.parentSpanId ?? undefined,
      );
      return ToolResultFactory.success("calculate", String(result));
    } catch (error) {
      return ToolResultFactory.failure(
        "calculate",
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  },
  {
    name: "calculate",
    description: "Perform a mathematical calculation or solve an equation",
    schema: z.object({
      expression: z
        .string()
        .describe("A math expression or question (e.g., 'What is 15 * 23?')"),
    }),
  },
);

/**
 * Manual wrapper for research
 * Allows custom parameters and behavior
 */
const researchTopicTool = createFunctionTool(
  async (
    input: { topic: string; focus?: string | undefined },
    context: ToolExecutionContext,
  ) => {
    try {
      let query = `Explain ${input.topic}`;
      if (input.focus) {
        query += ` with focus on ${input.focus}`;
      }

      console.log(`  🔧 Delegating to ResearchAgent: "${query}"`);
      const result = await researchAgent.process(
        query,
        context.spanId ?? context.agentContext.parentSpanId ?? undefined,
      );
      return ToolResultFactory.success("research_topic", String(result));
    } catch (error) {
      return ToolResultFactory.failure(
        "research_topic",
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  },
  {
    name: "research_topic",
    description: "Research and explain a topic or concept",
    schema: z.object({
      topic: z.string().describe("The topic to research and explain"),
      focus: z
        .string()
        .optional()
        .describe(
          "Specific aspect to focus on (e.g., 'history', 'applications')",
        ),
    }),
  },
);

/**
 * Coordinator V2: Uses manual tool wrappers
 * Gives more control over how agents are invoked
 */
const coordinatorV2 = new Agent({
  name: "CoordinatorV2",
  description: "Coordinates between specialized tools with custom interfaces",
  instructions: `You help users solve problems by delegating to specialized tools:
- Use calculate() for mathematical operations
- Use research_topic() for explanations and research

Delegate appropriately and synthesize the results.`,
  tools: [calculateTool, researchTopicTool],
  maxIterations: 5,
  verbose: true,
  model: "gcp/gemini-flash-lite-latest",
});

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main(): Promise<void> {
  // Example 1: Test Approach 1 (asTool)
  console.log("\n" + "=".repeat(70));
  console.log("Testing Approach 1: asTool()");
  console.log("=".repeat(70) + "\n");

  const task1 =
    "I need to calculate 37 * 25, then explain what prime numbers are";
  console.log(`📝 Task: ${task1}\n`);

  try {
    const result1 = await coordinatorV1.process(task1);
    console.log("\n" + "=".repeat(70));
    console.log("Final Result (Approach 1):");
    console.log("=".repeat(70));
    console.log(result1);
  } catch (error) {
    console.error("\n❌ Error in Approach 1:", error);
  }

  // Example 2: Test Approach 2 (Manual wrappers)
  console.log("\n\n" + "=".repeat(70));
  console.log("Testing Approach 2: Manual Tool Wrappers");
  console.log("=".repeat(70) + "\n");

  const task2 =
    "Calculate the area of a circle with radius 5, then research the Pythagorean theorem with focus on history";
  console.log(`📝 Task: ${task2}\n`);

  try {
    const result2 = await coordinatorV2.process(task2);
    console.log("\n" + "=".repeat(70));
    console.log("Final Result (Approach 2):");
    console.log("=".repeat(70));
    console.log(result2);
  } catch (error) {
    console.error("\n❌ Error in Approach 2:", error);
  }

  // Summary
  console.log("\n\n" + "=".repeat(70));
  console.log("Summary: When to Use Each Approach");
  console.log("=".repeat(70));
  console.log(`
📌 Use asTool() when:
  - You want simple, quick agent composition
  - The agent's existing interface is sufficient
  - You're prototyping or building simple workflows

📌 Use Manual Wrappers when:
  - You need custom parameters or validation
  - You want to modify inputs/outputs before delegation
  - You need error handling specific to your use case
  - You're building production systems with specific contracts
  `);
}

// Run the example
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
