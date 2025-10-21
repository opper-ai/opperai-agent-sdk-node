# Streaming Output

Streaming lets you consume Opper responses incrementally while preserving the SDK’s type guarantees. Set `enableStreaming: true` on any agent to opt-in. The agent will automatically choose the streaming path for both the think loop and the final result generation.

## Enable Streaming

```ts
const agent = new Agent({
  name: "LiveAgent",
  instructions: "Stream your intermediate reasoning.",
  enableStreaming: true,
  outputSchema: ResultSchema, // optional
  onStreamStart: ({ callType }) => {
    console.log(`[stream:start] ${callType}`);
  },
  onStreamChunk: ({ callType, accumulated }) => {
    if (callType === "final_result") {
      process.stdout.write(accumulated);
    }
  },
});
```

When streaming is enabled the SDK switches to `opperClient.stream(...)`, buffers deltas, and reconstructs the final JSON payload before validation.

## Lifecycle Events

Streaming exposes dedicated hooks and matching event-emitter notifications. Hooks run every time, and listeners registered via `agent.on(...)` receive the same payloads synchronously.

| Name | HookEvents constant | Payload highlights |
| --- | --- | --- |
| Start | `HookEvents.StreamStart` | `{ context, callType }` |
| Chunk | `HookEvents.StreamChunk` | `{ context, callType, chunkData, accumulated, fieldBuffers }` |
| End | `HookEvents.StreamEnd` | `{ context, callType, fieldBuffers }` |
| Error | `HookEvents.StreamError` | `{ context, callType, error }` |

```ts
agent.registerHook(HookEvents.StreamChunk, ({ callType, accumulated }) => {
  if (callType === "final_result") {
    console.log(accumulated);
  }
});

// EventEmitter style
agent.on(HookEvents.StreamChunk, ({ callType, fieldBuffers }) => {
  if (callType === "think") {
    console.log(fieldBuffers.reasoning);
  }
});

You can subscribe inline via the constructor with `onStreamStart`, `onStreamChunk`, `onStreamEnd`, and `onStreamError` (shown above), or register listeners later using hooks/event emitters if you need to dynamically add/remove handlers.
```

`callType` is `"think"` for the ReAct loop and `"final_result"` for the closing generation. Payloads intentionally mirror the Python SDK.

## Field Buffers & JSON Paths

Each chunk includes the Opper `jsonPath` pointing to the schema field being populated. The SDK keeps two internal buffers:

- `accumulated`: the running string for the current `jsonPath`
- `fieldBuffers`: string snapshots for every field (object keyed by `jsonPath`, `_root` is used when no path is provided)

Once the stream completes the buffers are stitched back into a single object via `createStreamAssembler()` and (if present) validated against your `outputSchema`. You can import the assembler for advanced scenarios:

```ts
import { createStreamAssembler } from "@opperai/agents";

const assembler = createStreamAssembler();
assembler.feed({ delta: "Ada", jsonPath: "attendees[0].name" });
assembler.feed({ delta: "Grace", jsonPath: "attendees[1].name" });
console.log(assembler.finalize().structured);
```

## Usage Tracking

Streaming responses do not include token usage today. The agent captures the first chunk’s `spanId` and performs a span → trace lookup after the stream completes:

1. `spannId` captured from the event stream
2. `opperClient.getClient().spans.get(spanId)` to discover the `traceId`
3. `opperClient.getClient().traces.get(traceId)` to read `data.totalTokens`
4. `AgentContext.updateUsage({ requests: 1, totalTokens })`

If the lookup fails (missing span, network error, etc.) the SDK still increments `requests` so metering stays monotonic. A warning is logged via the agent’s logger in that case.

## Structured vs Text Mode

- With an `outputSchema` the SDK expects structured chunks and will throw if the stream never supplies structured data.
- Without a schema chunks are concatenated under `_root` and the final result is the joined string.

Both modes emit identical hook payloads so you can render UI components regardless of which style the agent uses.

## Examples

- `examples/01_getting_started/09-streaming-basic.ts` – minimal streaming setup with inline handlers.
- `examples/applied_agents/streaming-live-monitor.ts` – advanced streaming dashboard with tools and structured output.
