/**
 * Example 9: Streaming with Event Subscribers
 *
 * This example shows how to:
 *  - Enable streaming on an agent
 *  - Subscribe to streaming events via inline constructor handlers
 *  - Subscribe later via hooks/event emitters (previous pattern)
 *  - Render incremental reasoning and final results to the terminal
 *
 * Run with:
 *   pnpm example examples/01_getting_started/09-streaming-basic.ts
 */

import { Agent, HookEvents } from "@opperai/agents";
import { z } from "zod";

const StreamingSummarySchema = z.object({
  summary: z.string().describe("One paragraph highlighting the main idea"),
  bulletPoints: z
    .array(z.string())
    .min(3)
    .describe("Concise takeaways the user can skim in real-time"),
});

type StreamingSummary = z.infer<typeof StreamingSummarySchema>;

const toDisplayString = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
};

async function main(): Promise<void> {
  if (!process.env["OPPER_API_KEY"]) {
    console.error("❌ OPPER_API_KEY environment variable is not set.");
    console.error(
      "Set it with: export OPPER_API_KEY='your-api-key' before running this example.",
    );
    process.exit(1);
  }

  const seenFinalFields = new Set<string>();

  const agent = new Agent<string, StreamingSummary>({
    name: "StreamingDemoAgent",
    description:
      "Summarises topics with live feedback so UIs can update while the LLM is thinking.",
    instructions: `
You are helping showcase streaming support in the Opper TypeScript SDK.
When you think, explain your reasoning briefly.
When you answer, produce a short summary paragraph plus three bullet points.
Keep everything concise so it fits nicely in a terminal demo.
    `.trim(),
    model: "gcp/gemini-flash-lite-latest",
    outputSchema: StreamingSummarySchema,
    enableStreaming: true,
    verbose: false,
    onStreamStart: ({ callType }) => {
      console.log(`\n[stream:start] ${callType}`);
      if (callType === "think") {
        process.stdout.write("   reasoning: ");
      }
    },
    onStreamChunk: ({ callType, chunkData, accumulated }) => {
      const jsonPath = chunkData.jsonPath ?? "_root";
      const deltaText = toDisplayString(chunkData.delta);

      if (callType === "think") {
        process.stdout.write(deltaText);
        return;
      }

      if (callType === "final_result") {
        if (jsonPath === "summary") {
          if (!seenFinalFields.has(jsonPath)) {
            console.log("\n   summary:");
            seenFinalFields.add(jsonPath);
          }
          process.stdout.write(`     ${deltaText}`);
        } else if (jsonPath.startsWith("bulletPoints")) {
          if (!seenFinalFields.has(jsonPath)) {
            console.log(
              `\n   bullet ${jsonPath.replace("bulletPoints[", "#").replace("]", "")}:`,
            );
            seenFinalFields.add(jsonPath);
          }
          process.stdout.write(`     ${accumulated}`);
        }
      }
    },
    onStreamEnd: ({ callType }) => {
      console.log(`\n[stream:end] ${callType}\n`);
    },
    onStreamError: ({ callType, error }) => {
      console.error(`\n[stream:error] ${callType}:`, error);
    },
  });

  console.log("🛰️  Streaming demo – streaming via inline handlers\n");

  // Alternative pattern: subscribe after construction using the event emitter + hooks.
  // These prints are intentionally prefixed so they stand out from the inline handlers.
  const unsubscribeEmitter = agent.on(
    HookEvents.StreamChunk,
    ({ callType, chunkData }) => {
      if (callType === "think" && chunkData.jsonPath === "reasoning") {
        console.log(
          `\n[event-emitter] reasoning chunk: ${toDisplayString(chunkData.delta)}`,
        );
      }
    },
  );
  const unregisterHook = agent.registerHook(
    HookEvents.StreamEnd,
    ({ callType }) => {
      console.log(`[hook] stream ended for ${callType}`);
    },
  );

  const topic =
    "Explain why streaming responses improve developer ergonomics in AI-assisted tooling.";

  console.log(`🎯 Topic: ${topic}\n`);

  try {
    const result = await agent.process(topic);

    console.log("\n✅ Final structured result:");
    console.dir(result, { depth: null });
  } catch (error) {
    console.error("❌ Streaming demo failed:", error);
    process.exit(1);
  } finally {
    unregisterHook();
    unsubscribeEmitter();
  }
}

void main().catch((error) => {
  console.error("Unexpected failure running the streaming demo:", error);
  process.exit(1);
});
