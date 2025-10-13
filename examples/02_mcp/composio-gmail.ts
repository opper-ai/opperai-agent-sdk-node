import { Agent, HookEvents, MCPconfig, mcp } from "@opperai/agents";
import { z } from "zod";

const GmailResultsSchema = z.object({
  emails: z
    .array(
      z.object({
        id: z.string().optional(),
        subject: z.string().optional(),
        sender: z.string().optional(),
        snippet: z.string().optional(),
        threadId: z.string().optional(),
      }),
    )
    .default([]),
  total_count: z.number().int().nonnegative().default(0),
  success: z.boolean().default(false),
  message: z.string().default(""),
});

type GmailResults = z.infer<typeof GmailResultsSchema>;

const getEnv = (key: string): string | undefined => {
  const value = process.env[key];
  return value !== undefined && value.length > 0 ? value : undefined;
};

async function main(): Promise<void> {
  console.log("Gmail MCP Integration Example");
  console.log("=".repeat(50));

  const gmailEndpoint = getEnv("COMPOSIO_GMAIL_MCP_URL");
  if (!gmailEndpoint) {
    throw new Error("Missing COMPOSIO_GMAIL_MCP_URL environment variable");
  }

  const composioToken = getEnv("COMPOSIO_API_KEY");

  const gmailServer = MCPconfig({
    name: "composio-gmail",
    transport: "streamable-http",
    url: gmailEndpoint,
    headers: composioToken
      ? {
          Authorization: `Bearer ${composioToken}`,
        }
      : {},
  });

  const agent = new Agent({
    name: "GmailAgent",
    description: "Reads Gmail inbox using Composio MCP tools",
    instructions:
      "Use the Gmail MCP tools to help users understand their inbox. Provide concise summaries of messages you retrieve.",
    tools: [mcp(gmailServer)],
    outputSchema: GmailResultsSchema,
    maxIterations: 15,
    verbose: true,
  });

  agent.registerHook(HookEvents.LoopEnd, async ({ context }) => {
    const latest = context.executionHistory.at(-1);
    if (!latest) {
      return;
    }

    const thought = latest.thought;
    if (
      thought &&
      typeof thought === "object" &&
      "reasoning" in (thought as Record<string, unknown>)
    ) {
      const reasoning = (thought as Record<string, unknown>)["reasoning"];
      if (typeof reasoning === "string" && reasoning.trim().length > 0) {
        console.log(`\n[Iteration ${latest.iteration}] ${reasoning}\n`);
      }
    }
  });

  const goal =
    "List my last 5 unread emails and include their subjects and senders.";
  console.log(`\nGoal: ${goal}`);
  console.log("Running Gmail Agent...\n");

  const result = await agent.process(goal);

  console.log("\n" + "=".repeat(50));
  console.log("RESULT:");
  console.log("=".repeat(50));
  console.dir(result, { depth: null });
}

main().catch((error) => {
  console.error("\nError running Gmail MCP example", error);
  console.error("\nTroubleshooting tips:");
  console.error(
    "  • Ensure COMPOSIO_GMAIL_MCP_URL is set to your Composio MCP endpoint",
  );
  console.error(
    "  • Provide COMPOSIO_API_KEY if your endpoint requires Bearer auth",
  );
  console.error("  • Confirm OPPER_API_KEY is configured and valid");
  console.error("  • Check network connectivity to the MCP endpoint");
  process.exitCode = 1;
});
