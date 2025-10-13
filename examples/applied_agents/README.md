# Applied Agent Examples

This directory contains real-world examples of agents built with the Opper Agent TypeScript SDK, demonstrating practical applications and advanced patterns.

## Examples

### 1. Weather Agent

**File:** `weather-conversation.ts`

A conversational agent that demonstrates structured input/output with conversation-style messages. Shows how to build natural, multi-turn conversations with an agent.

**Features:**

- Conversation-style message schemas
- Structured input with message history
- Structured output as assistant messages
- Hook-based monitoring of agent thinking
- Natural language interaction patterns

**Run it:**

```bash
pnpm example examples/applied_agents/weather-conversation.ts
```

**What it demonstrates:**

- Building conversational interfaces
- Using hooks to monitor agent reasoning
- Handling multi-turn conversations
- Structured input/output schemas for chat
- Tool usage within conversations

---

### 2. Deep Research Agent

**File:** `deep-research-agent.ts`

A comprehensive research agent that uses Composio's MCP search tools to gather information from the web and build detailed research reports.

**Features:**

- MCP integration with Composio search tools
- Structured research workflows
- Custom tools alongside MCP tools
- File system operations (saving reports)
- Deep multi-iteration research

**Prerequisites:**

- Composio MCP search endpoint
- Set `COMPOSIO_SEARCH_MCP_URL` environment variable
- Optionally set `COMPOSIO_API_KEY` if required

**Run it:**

```bash
export COMPOSIO_SEARCH_MCP_URL="your-composio-mcp-url"
export COMPOSIO_API_KEY="your-composio-key" # optional
pnpm example examples/applied_agents/deep-research-agent.ts
```

**What it demonstrates:**

- Deep research workflows
- MCP tool provider integration
- Custom tools (save_report)
- Structured research schemas
- Multi-iteration agent workflows
- File system operations from agents

---

## Common Patterns

### Structured Input/Output

Both examples use Zod schemas to define structured input and output:

```typescript
import { z } from "zod";

const InputSchema = z.object({
  field1: z.string().describe("Description for LLM"),
  field2: z.number().optional(),
});

const OutputSchema = z.object({
  result: z.string(),
  metadata: z.record(z.unknown()),
});

const agent = new Agent({
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  // ... other config
});
```

### Hook-Based Monitoring

Monitor agent behavior during execution:

```typescript
agent.registerHook(HookEvents.LoopEnd, ({ context }) => {
  const latest = context.executionHistory.at(-1);
  // Log or analyze agent reasoning
});
```

### MCP Integration

Use external tool providers via MCP:

```typescript
import { MCPconfig, mcp } from "opper-agents";

const mcpConfig = MCPconfig({
  name: "provider-name",
  transport: "streamable-http",
  url: "https://your-mcp-endpoint.com",
});

const agent = new Agent({
  tools: [
    mcp(mcpConfig), // MCP tools
    customTool, // Your custom tools
  ],
});
```

## Tips for Building Applied Agents

1. **Start with Clear Schemas** - Define input/output structures upfront
2. **Use Hooks for Observability** - Monitor agent behavior during development
3. **Combine Tools** - Mix MCP providers with custom tools
4. **Allow Sufficient Iterations** - Complex tasks need more iterations
5. **Test Incrementally** - Start simple, add complexity gradually
6. **Handle Errors Gracefully** - Use try/catch and validate inputs

## Next Steps

- Explore the getting started examples in `examples/01_getting_started/`
- Check out MCP examples in `examples/02_mcp/`
- Read the main README at `examples/README.md`
- Review the SDK documentation

---

Built with the Opper Agent TypeScript SDK
