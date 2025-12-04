/**
 * Streaming Live Monitor
 *
 * A more advanced streaming example that mirrors the Python SDK demo.
 * It showcases how to:
 *  - Combine streaming with tools and structured schemas
 *  - React to stream events to build a live CLI dashboard
 *  - Track reasoning, tool selection, and the final structured output
 *
 * Run with:
 *   pnpm example examples/applied_agents/streaming-live-monitor.ts
 */

import {
  Agent,
  HookEvents,
  createFunctionTool,
  ToolResultFactory,
  type ToolExecutionContext,
} from "@opperai/agents";
import { z } from "zod";

const AnalysisSchema = z.object({
  topic: z.string().describe("What was analysed"),
  keyFindings: z.array(z.string()).describe("Main findings"),
  conclusion: z.string().describe("Final conclusion written in plain language"),
});

type Analysis = z.infer<typeof AnalysisSchema>;

const researchTopic = createFunctionTool(
  async (
    input: { topic: string },
    _context: ToolExecutionContext,
  ): Promise<ReturnType<typeof ToolResultFactory.success>> => {
    const request = input.topic.toLowerCase();
    const facts =
      request.includes("ai") || request.includes("artificial intelligence")
        ? [
            "LLMs are increasingly embedded in enterprise tooling.",
            "Governance and safety reviews are accelerating.",
            "Vendors emphasise retrieval + agents combos.",
          ]
        : request.includes("climate")
          ? [
              "Global temperature anomalies hit new highs in the last decade.",
              "Extreme weather events increase in frequency.",
              "Mitigation investments focus on energy transition.",
            ]
          : [
              "Streaming yields faster perceived latency.",
              "Developers rely on partial output for UI updates.",
              "Structured streaming delivers field-level deltas.",
            ];

    return ToolResultFactory.success("research_topic", { facts });
  },
  {
    name: "research_topic",
    description: "Collect quick reference facts about a topic.",
    schema: z.object({
      topic: z
        .string()
        .describe(
          "The topic we are researching, e.g. 'enterprise AI strategy'",
        ),
    }),
  },
);

const analyseFacts = createFunctionTool(
  async (
    input: { facts: string[] },
    _context: ToolExecutionContext,
  ): Promise<ReturnType<typeof ToolResultFactory.success>> => {
    const bulletPoints = input.facts.map(
      (fact, index) => `Insight ${index + 1}: ${fact}`,
    );

    return ToolResultFactory.success("analyse_facts", {
      insights: bulletPoints,
    });
  },
  {
    name: "analyse_facts",
    description: "Transform raw fact strings into structured insights.",
    schema: z.object({
      facts: z.array(z.string()).describe("The facts gathered during research"),
    }),
  },
);

type StreamState = {
  currentCall: "think" | "final_result" | null;
  reasoningPrinted: boolean;
  toolBannerPrinted: boolean;
  conclusionBannerPrinted: boolean;
};

const state: StreamState = {
  currentCall: null,
  reasoningPrinted: false,
  toolBannerPrinted: false,
  conclusionBannerPrinted: false,
};

async function main(): Promise<void> {
  if (!process.env["OPPER_API_KEY"]) {
    console.error("❌ OPPER_API_KEY environment variable is not set.");
    console.error(
      "Set it with: export OPPER_API_KEY='your-api-key' before running this example.",
    );
    process.exit(1);
  }

  console.log("🔭 Advanced Streaming Monitor");
  console.log("=".repeat(60));
  console.log(
    "This example logs the agent's live reasoning, tool plan, and final output.\n",
  );

  const agent = new Agent<string, Analysis>({
    name: "StreamingMonitorAgent",
    description:
      "Performs lightweight research while streaming reasoning and results.",
    instructions: `
You are a senior analyst. Think out loud while you reason so observers can follow along.
Use the available tools to collect reference material and to turn those facts into insights.
Return a structured analysis with a topic, key findings (3 bullet points), and a crisp conclusion.
    `.trim(),
    tools: [researchTopic, analyseFacts],
    outputSchema: AnalysisSchema,
    enableStreaming: true,
    maxIterations: 4,
    model: "gcp/gemini-flash-lite-latest",
    onStreamStart: ({ callType }) => {
      if (callType === "think" || callType === "final_result") {
        state.currentCall = callType;
      } else {
        state.currentCall = null;
      }
      state.reasoningPrinted = false;
      state.toolBannerPrinted = false;
      state.conclusionBannerPrinted = false;

      if (callType === "think") {
        console.log("\n🤔 Agent is reasoning...");
      } else {
        console.log("\n📝 Generating final analysis...");
      }
    },
    onStreamChunk: ({ callType, chunkData, accumulated }) => {
      const path = chunkData.jsonPath ?? "";

      if (callType === "think") {
        if (path === "reasoning") {
          if (!state.reasoningPrinted) {
            process.stdout.write("   💭 Reasoning: ");
            state.reasoningPrinted = true;
          }
          process.stdout.write(String(chunkData.delta ?? ""));
        } else if (path.includes("toolCalls") && !state.toolBannerPrinted) {
          console.log("\n   🔧 Selecting tools...");
          state.toolBannerPrinted = true;
        } else if (path.endsWith(".toolName")) {
          console.log(`      → ${accumulated}`);
        }
      } else if (callType === "final_result") {
        if (path === "topic" && accumulated) {
          console.log(`   📌 Topic: ${accumulated}`);
        } else if (path.startsWith("keyFindings[")) {
          const index = path.match(/\[(\d+)\]/)?.[1] ?? "?";
          console.log(`   • Finding ${index}: ${accumulated}`);
        } else if (path === "conclusion") {
          if (!state.conclusionBannerPrinted) {
            process.stdout.write("   ✅ Conclusion: ");
            state.conclusionBannerPrinted = true;
          }
          process.stdout.write(String(chunkData.delta ?? ""));
        }
      }
    },
    onStreamEnd: ({ callType }) => {
      if (callType === "think") {
        console.log("\n   ✓ Thinking complete\n");
      } else {
        console.log("\n\n   ✓ Final analysis ready\n");
      }
    },
    onStreamError: ({ callType, error }) => {
      console.error(`\n⚠️  Stream error during ${callType}:`, error);
    },
  });

  let finalUsage: { tokens: number; requests: number } | null = null;

  agent.registerHook(HookEvents.AgentEnd, ({ context }) => {
    finalUsage = {
      tokens: context.usage.totalTokens,
      requests: context.usage.requests,
    };
  });

  const task = "Summarise enterprise adoption patterns of AI agents";
  console.log(`🎯 Task: ${task}\n`);

  try {
    const result = await agent.process(task);

    console.log("Final structured result:");
    console.dir(result, { depth: null });

    if (finalUsage !== null) {
      const { tokens, requests } = finalUsage;
      console.log(`\nUsage: ${tokens} tokens across ${requests} request(s)`);
    }
  } catch (error) {
    console.error("The agent failed to complete the task:", error);
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error("Fatal error while running the streaming monitor:", error);
  process.exit(1);
});
