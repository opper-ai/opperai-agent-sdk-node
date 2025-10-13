# Opper Agent SDK (TypeScript)

Type‑safe, composable agents for Opper AI in TypeScript using: generics, Zod schemas, modular tools, and modern DX.

- Async‑first
- Strong typing with Zod runtime validation
- Opper integration (spans, usage, retries)
- Hooks for observability and custom behavior
- Tools: function, decorator, MCP provider, or other agents via `.asTool()`

## Installation

```bash
npm install @opperai/agents
# or
yarn add @opperai/agents
# or
pnpm add @opperai/agents
```

**Prerequisites:** Node.js 20+

**Set your Opper API key:**

```bash
export OPPER_API_KEY="your-api-key"
```

Get your API key from the [Opper Dashboard](https://platform.opper.ai).

## Quick Start

To get started we recommend navigating to the [examples/01_getting_started](./examples/01_getting_started/). They are designed to walk you through the different features of this SDK.

Minimal agent that returns structured JSON:

```ts
import { Agent } from "@opperai/agents";
import { z } from "zod";

const Output = z.object({ message: z.string() });

type OutputType = z.infer<typeof Output>;

const agent = new Agent<string, OutputType>({
  name: "HelloAgent",
  instructions: "Greet the user briefly.",
  outputSchema: Output,
});

const result = await agent.process("Say hi to Ada");
// => { message: "Hi Ada!" }
```

## Tools

Define tools with Zod schemas. Results are discriminated unions that never throw.

```ts
import {
  createFunctionTool,
  ToolResultFactory,
  Agent,
} from "@opperai/agents";
import { z } from "zod";

const add = createFunctionTool(
  (input: { a: number; b: number }) => input.a + input.b,
  { name: "add", schema: z.object({ a: z.number(), b: z.number() }) },
);

const agent = new Agent<string, { answer: number }>({
  name: "MathAgent",
  instructions: "Use tools to compute when needed.",
  tools: [add],
  outputSchema: z.object({ answer: z.number() }),
});

const res = await agent.process("What is (5 + 3)? Return JSON with answer.");
```

Decorator tools and extraction:

```ts
import { tool, extractTools } from "@opperai/agents";
import { z } from "zod";

class WeatherTools {
  @tool({ schema: z.object({ city: z.string() }) })
  async get_weather({ city }: { city: string }) {
    return { city, tempC: 22 };
  }
}

const tools = extractTools(new WeatherTools());
```

## Agent as Tool

Compose agents by reusing them as tools.

```ts
import { Agent } from "@opperai/agents";
import { z } from "zod";

const Summarize = new Agent<string, { summary: string }>({
  name: "Summarizer",
  instructions: "Summarize in one sentence.",
  outputSchema: z.object({ summary: z.string() }),
});

const Coordinator = new Agent<string, string>({
  name: "Coordinator",
  instructions: "Delegate to tools and answer.",
  tools: [Summarize.asTool("summarize")],
});

const answer = await Coordinator.process(
  "Summarize: Opper helps you build agents.",
);
```

## MCP Integration

Wrap MCP servers as tool providers in one line.

```ts
import { mcp, MCPconfig, Agent } from "@opperai/agents";

const fsServer = MCPconfig({ name: "fs", transport: "stdio" });

const agent = new Agent<string, string>({
  name: "FSReader",
  instructions: "Use filesystem tools to answer questions.",
  tools: [mcp(fsServer)],
});

const out = await agent.process("Read README.md and summarize it.");
```

## Hooks & Context

Observe the loop and collect metrics without breaking execution.

```ts
import { HookEvents } from "@opperai/agents";

agent.registerHook(HookEvents.LoopEnd, ({ context }) => {
  const last = context.executionHistory.at(-1);
  if (last) console.log("iteration", last.iteration);
});
```

`AgentContext` tracks usage automatically. Inspect it via hooks:

```ts
agent.registerHook(HookEvents.AgentEnd, ({ context }) => {
  console.log(context.usage); // { requests, inputTokens, outputTokens, totalTokens }
});
```

## Type Safety with Zod

- Provide `inputSchema`/`outputSchema` to validate at runtime and type the agent at compile time.
- Schemas with defaults/transforms are supported. If you use Zod defaults on fields (e.g., `z.string().default("")`), the agent will still deliver a fully‑typed output.

## Testing & Tooling

```bash
pnpm install
pnpm lint
pnpm format
pnpm test
pnpm build
```

- Tests use `vitest` and avoid real network calls.
- Build bundles ESM/CJS and `.d.ts` into `dist/` via `tsup`.

## Examples

See `examples/` for getting started, tools, composition, memory, and MCP usage. Run with `pnpm build` then `tsx <file>`.

## License

MIT
