/**
 * Example 9: Streaming with Event Subscribers
 *
 * This example shows how to:
 *  - Enable streaming on an agent
 *  - Subscribe to streaming events via the built-in event emitter
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
  });

  console.log("🛰️  Streaming demo – subscribing to agent events\n");

  agent.on(HookEvents.StreamStart, ({ callType }) => {
    console.log(`\n[stream:start] ${callType}`);
    if (callType === "think") {
      process.stdout.write("   reasoning: ");
    }
  });

  const seenFinalFields = new Set<string>();
  const unsubscribeChunk = agent.on(
    HookEvents.StreamChunk,
    ({ callType, chunkData, accumulated }) => {
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
            console.log(`\n   bullet ${jsonPath.replace("bulletPoints[", "#").replace("]", "")}:`);
            seenFinalFields.add(jsonPath);
          }
          process.stdout.write(`     ${accumulated}`);
        }
      }
    },
  );

  agent.on(HookEvents.StreamEnd, ({ callType }) => {
    console.log(`\n[stream:end] ${callType}\n`);
  });

  agent.on(HookEvents.StreamError, ({ callType, error }) => {
    console.error(`\n[stream:error] ${callType}:`, error);
  });

  const topic =
    "Explain why streaming responses improve developer ergonomics in AI-assisted tooling.";

  console.log(`🎯 Topic: ${topic}\n`);

  try {
    const result = await agent.process(topic);

    console.log("\n✅ Final structured result:");
    console.dir(result, { depth: null });
  } finally {
    // Remove the listener to avoid retaining references if the agent lives longer.
    unsubscribeChunk();
  }
}

void main().catch((error) => {
  console.error("Unexpected failure running the streaming demo:", error);
  process.exit(1);
});
