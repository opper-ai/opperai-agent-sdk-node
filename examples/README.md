# Opper Agent SDK Examples

This directory contains TypeScript examples showcasing the Opper Agent SDK. Each example demonstrates key concepts and patterns in an idiomatic TypeScript style.

## Prerequisites

1. **Node.js 20+** installed
2. **pnpm** installed (`npm install -g pnpm`)
3. **Opper API Key** - Get yours at [opper.ai](https://opper.ai)

## Setup

### 1. Install Dependencies

From the repository root:

```bash
pnpm install
```

### 2. Build the SDK

```bash
pnpm build
```

### 3. Set Your API Key

```bash
export OPPER_API_KEY='your-api-key-here'
```

Or create a `.env` file in the repository root:

```bash
OPPER_API_KEY=your-api-key-here
```

## Running Examples

All examples can be run with `tsx` (TypeScript executor):

```bash
# From the repository root
pnpm example examples/01_getting_started/00-first-agent.ts
pnpm example examples/01_getting_started/01-agent-with-tool.ts
pnpm example examples/01_getting_started/02-schemas.ts
pnpm example examples/01_getting_started/03-tool-patterns.ts
pnpm example examples/01_getting_started/04-agent-as-tool.ts
pnpm example examples/01_getting_started/05-memory-usage.ts
pnpm example examples/02_mcp/basic-filesystem.ts
pnpm example examples/02_mcp/composio-gmail.ts
```

Or use `tsx` directly:

```bash
npx tsx examples/01_getting_started/00-first-agent.ts
```

## Examples Overview

### Example 0: First Agent (Quickstart)

**File:** `01_getting_started/00-first-agent.ts`

The simplest possible agent - perfect for getting started:

- Minimal configuration with just a name and instructions
- Demonstrates output schema validation
- Shows basic agent.process() usage

**Key Concepts:**

- ✅ Agent creation with minimal config
- ✅ Output schema validation with Zod
- ✅ Type-safe results

**Run it:**

```bash
pnpm example examples/01_getting_started/00-first-agent.ts
```

**Expected Output:**

```typescript
{
  message: "Hi Ada!";
}
```

---

### Example 1: Agent with Tools

**File:** `01_getting_started/01-agent-with-tool.ts`

Demonstrates the fundamentals:

- Creating an agent with typed tools
- Using `createFunctionTool` for tool definitions
- Registering hooks to monitor execution
- Processing tasks and accessing execution context

**Key Concepts:**

- ✅ Strongly-typed tool schemas with Zod
- ✅ Tool creation using factory functions
- ✅ Hook system for observability
- ✅ Error handling with `ToolResultFactory`
- ✅ Execution stats and token usage tracking

**Run it:**

```bash
pnpm example examples/01_getting_started/01-agent-with-tool.ts
```

**Expected Output:**

```
✅ OPPER_API_KEY found

============================================================
Testing Agent with Simple Math Task
============================================================

📝 Task: What is (5 + 3) * 2?

🚀 Agent starting...
   Session: <session-id>
  🔧 Tool called: add(5, 3)
   ✅ Tool add succeeded with output: 8
  🔧 Tool called: multiply(8, 2)
   ✅ Tool multiply succeeded with output: 16

✅ Agent completed successfully

============================================================
Execution Stats:
============================================================
  Iterations: 2
  Tool calls: 2
  Token usage: { ... }
```

---

### Example 2: Input and Output Schemas

**File:** `01_getting_started/02-schemas.ts`

Demonstrates structured input/output validation:

- Defining input schemas for agent requests
- Defining output schemas for agent responses
- Type-safe agent inputs and outputs

**Key Concepts:**

- ✅ Input validation with Zod schemas
- ✅ Output validation and type safety
- ✅ Schema-driven development

**Run it:**

```bash
pnpm example examples/01_getting_started/02-schemas.ts
```

---

### Example 3: Tool Definition Patterns

**File:** `01_getting_started/03-tool-patterns.ts`

Demonstrates different ways to define and use tools:

- **Decorator-based tools:** Using `@tool` decorator on class methods
- **Function-based tools:** Using `createFunctionTool` with standalone functions
- **Combining both patterns:** Mix decorator and function tools in a single agent

**Key Concepts:**

- ✅ Class-based tool organization with `@tool` decorator
- ✅ Extracting tools from classes with `extractTools()`
- ✅ Function-based tools for standalone operations
- ✅ Combining multiple tool definition styles
- ✅ When to use each pattern

**Run it:**

```bash
pnpm example examples/01_getting_started/03-tool-patterns.ts
```

**Expected Output:**

```
📦 Extracted tools from class:
   - get_weather: Get current weather information for a specific location
   - get_forecast: Get weather forecast for the next few days

📦 Function-based tools:
   - convert_temperature: Convert temperature between Celsius, Fahrenheit, and Kelvin
   - get_timezone: Get timezone information and current time for a location

📝 Task: What's the weather like in Tokyo? Also, if it's 72°F in New York,
         what is that in Celsius? And what time is it in London?

  🌤️  Fetching weather for Tokyo in celsius
  🌡️  Converting 72°F to celsius
  🕒 Getting timezone info for London
...
```

---

### Example 4: Agent-as-Tool Pattern

**File:** `01_getting_started/04-agent-as-tool.ts`

Demonstrates agent composition patterns:

- Creating specialized agents (Math, Research)
- Two approaches to using agents as tools
  - **Approach 1:** Simple `asTool()` method
  - **Approach 2:** Manual tool wrappers for custom control
- Building coordinator agents that delegate

**Key Concepts:**

- ✅ Agent composition and delegation
- ✅ Using `asTool()` for quick composition
- ✅ Manual tool wrapping for custom interfaces
- ✅ Multi-agent workflows
- ✅ When to use each approach

**Run it:**

```bash
pnpm example examples/01_getting_started/04-agent-as-tool.ts
```

**Expected Output:**

```
======================================================================
APPROACH 1: Using asTool() - Simple and Recommended
======================================================================

📝 Task: I need to calculate 37 * 25, then explain what prime numbers are

  🔧 Delegating to MathAgent: "37 * 25"
  🔧 Delegating to ResearchAgent: "Explain prime numbers"

============================================================
Final Result (Approach 1):
============================================================
The calculation 37 * 25 equals 925.

Prime numbers are natural numbers greater than 1...

======================================================================
APPROACH 2: Manual Tool Wrappers
======================================================================
...
```

---

### Example 5: Memory Usage

**File:** `01_getting_started/05-memory-usage.ts`

Demonstrates persistent memory across agent executions:

- Enabling memory subsystem
- Writing and reading memory within a single process call
- Memory persistence across multiple process calls

**Key Concepts:**

- ✅ Memory enable and configuration
- ✅ Writing values to persistent storage
- ✅ Reading values from memory
- ✅ Memory hooks for observability

**Run it:**

```bash
pnpm example examples/01_getting_started/05-memory-usage.ts
```

---

### Example 6: MCP Filesystem Provider

**File:** `02_mcp/basic-filesystem.ts`

Demonstrates how to wrap an MCP server as a tool provider using the official MCP TypeScript SDK. The agent connects to a filesystem server over stdio and can read files exposed by that server.

**Key Concepts:**

- ✅ Declarative MCP server configuration with `MCPconfig`
- ✅ Registering MCP providers via `mcp(...)`
- ✅ Provider lifecycle (connect on start, disconnect on teardown)

**Before running:** Start a filesystem MCP server in another terminal. A quick option is:

```bash
npx @modelcontextprotocol/server-filesystem .
```

**Run it:**

```bash
pnpm example examples/02_mcp/basic-filesystem.ts
```

The agent connects to the server, lists the available filesystem tools, and uses them to inspect the repository README.

---

### Example 7: MCP Gmail via Streamable HTTP

**File:** `02_mcp/composio-gmail.ts`

Shows how to integrate a Composio-hosted Gmail MCP endpoint using the Streamable HTTP transport. The example demonstrates authenticated headers, session reuse, and hook-based logging of the agent's reasoning.

**Key Concepts:**

- ✅ Streamable HTTP transport (`transport: "streamable-http"`)
- ✅ Header-based authentication for MCP servers
- ✅ Hooking into `loop:end` for iteration-level visibility

**Before running:**

1. Export `COMPOSIO_GMAIL_MCP_URL` with your Composio Streamable HTTP endpoint.
2. Optionally export `COMPOSIO_API_KEY` if the endpoint requires Bearer auth.

**Run it:**

```bash
pnpm example examples/02_mcp/composio-gmail.ts
```

The agent connects through Streamable HTTP, invokes Gmail tools exposed by Composio, and prints a structured summary of unread messages.

---

## Example Patterns

### Creating Tools

**Pattern 1: Using `createFunctionTool` (function first, options second):**

```typescript
import { createFunctionTool, ToolResultFactory } from "@opperai/agent-ts";
import { z } from "zod";

const myTool = createFunctionTool(
  // Function first
  async (input, context) => {
    try {
      const result = await doSomething(input);
      return ToolResultFactory.success("my_tool", result);
    } catch (error) {
      return ToolResultFactory.failure("my_tool", error);
    }
  },
  // Options second
  {
    name: "my_tool",
    description: "What this tool does",
    schema: z.object({
      input: z.string().describe("Input parameter"),
    }),
  },
);
```

**Pattern 2: Using `@tool` decorator:**

```typescript
import {
  tool,
  extractTools,
  type ToolExecutionContext,
} from "@opperai/agent-ts";

class MyTools {
  @tool({
    name: "my_tool",
    description: "What this tool does",
    schema: z.object({ input: z.string() }),
  })
  async myTool(input: { input: string }, context: ToolExecutionContext) {
    const result = await doSomething(input);
    return result; // Return raw value, decorator handles wrapping
  }
}

// Extract all decorated tools
const tools = extractTools(new MyTools());
```

### Creating Agents

```typescript
import { Agent } from "@opperai/agent-ts";

const agent = new Agent({
  name: "MyAgent",
  description: "What the agent does",
  instructions: "Detailed instructions for the agent...",
  tools: [tool1, tool2],
  maxIterations: 5,
  verbose: true,
  model: "gpt-4",
});
```

### Using Hooks

```typescript
// Monitor agent lifecycle
agent.registerHook("agent:start", ({ context }) => {
  console.log("Agent started:", context.sessionId);
});

agent.registerHook("tool:after", ({ tool, result }) => {
  if (result.success) {
    console.log(`Tool ${tool.name} succeeded`);
  }
});

agent.registerHook("agent:end", ({ context, error }) => {
  console.log("Usage:", context.usage);
});
```

### Agent Composition

**Simple approach:**

```typescript
const specialistAgent = new Agent({
  /* config */
});

const coordinatorAgent = new Agent({
  name: "Coordinator",
  tools: [specialistAgent.asTool("specialist", "Delegate to specialist")],
});
```

**Custom approach:**

```typescript
const customTool = createFunctionTool(
  async (input, context) => {
    const result = await specialistAgent.process(input);
    return ToolResultFactory.success("delegate_to_specialist", result);
  },
  {
    name: "delegate_to_specialist",
    schema: z.object({
      /* custom schema */
    }),
  },
);
```

## TypeScript Features

These examples showcase idiomatic TypeScript patterns:

- ✅ **Strong typing** with generics (`Agent<Input, Output>`)
- ✅ **Zod schemas** for runtime validation
- ✅ **Discriminated unions** for results (`ToolResult`)
- ✅ **Async/await** throughout
- ✅ **Factory functions** for tool creation
- ✅ **Type inference** from schemas

## Troubleshooting

### API Key Not Set

```
❌ Error: OPPER_API_KEY environment variable not set
```

**Solution:** Export your API key or create a `.env` file.

### Module Not Found

```
Cannot find module '../src/...'
```

**Solution:** Run `pnpm build` from the repository root first.

### TSX Not Found

```
tsx: command not found
```

**Solution:** Use `npx tsx` or install globally: `npm install -g tsx`

## Next Steps

- Explore the SDK source code in `src/`
- Check out the tests in `tests/` for more examples
- Read the [CLAUDE.md](../CLAUDE.md) for development guidelines
- See [implementation_ts.md](../implementation_ts.md) for the full roadmap

## Need Help?

- 📖 Check the SDK documentation
- 🐛 Report issues on GitHub
- 💬 Join the Opper community

---

Built with ❤️ using the Opper Agent TypeScript SDK
