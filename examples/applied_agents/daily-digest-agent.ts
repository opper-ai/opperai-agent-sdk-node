/**
 * Daily Digest Agent with Multi-MCP Integration
 *
 * This example demonstrates a comprehensive daily digest agent that:
 * 1. Fetches emails from the last 24 hours via Gmail MCP
 * 2. Gets top 10 Hacker News posts from the last day via HN MCP
 * 3. Creates a structured Notion page with:
 *    - Main News last 24h
 *    - Main Email last 24h
 *    - Actions for today and links
 * 4. On Thursday/Friday, adds Stockholm restaurant recommendations for the weekend
 *
 * Prerequisites:
 * - Set your OPPER_API_KEY environment variable
 * - Get valid Composio credentials from https://app.composio.dev/
 * - Create a .env file with the following variables:
 *   - COMPOSIO_GMAIL_MCP_URL
 *   - COMPOSIO_HACKERNEWS_MCP_URL
 *   - COMPOSIO_NOTION_MCP_URL
 *   - COMPOSIO_SEARCH_MCP_URL
 *
 * Run with: pnpm example examples/applied_agents/daily-digest-agent.ts
 */

import { config } from "dotenv";
import { z } from "zod";
import { Agent, HookEvents, MCPconfig, mcp } from "@opperai/agents";

// Load environment variables from .env file
config();

// --- Schemas ---

const EmailSummarySchema = z.object({
  sender: z.string().describe("Email sender"),
  subject: z.string().describe("Email subject"),
  summary: z.string().describe("Brief summary of the email content"),
  action_required: z
    .boolean()
    .describe("Whether this email requires action from the user"),
  priority: z
    .enum(["high", "medium", "low"])
    .describe("Priority level: high, medium, or low"),
});

const NewsItemSchema = z.object({
  title: z.string().describe("News title"),
  url: z.string().optional().describe("Link to the article"),
  points: z.number().int().optional().describe("Number of points"),
  summary: z.string().describe("Brief summary of what this is about"),
  relevance: z.string().describe("Why this might be interesting"),
});

const ActionItemSchema = z.object({
  action: z.string().describe("The action to take"),
  source: z
    .enum(["email", "news", "other"])
    .describe("Source: email, news, or other"),
  link: z.string().optional().describe("Related link if available"),
  priority: z
    .enum(["high", "medium", "low"])
    .describe("Priority: high, medium, or low"),
});

const WeekendRecommendationSchema = z.object({
  name: z.string().describe("Restaurant name"),
  cuisine: z.string().describe("Type of cuisine"),
  description: z.string().describe("Brief description"),
  reason: z.string().describe("Why this is recommended"),
});

const DailyDigestSchema = z.object({
  date: z.string().describe("Date of the digest"),
  emails: z
    .array(EmailSummarySchema)
    .describe("Summary of important emails from last 24h"),
  news: z.array(NewsItemSchema).describe("Top news items from Hacker News"),
  actions: z.array(ActionItemSchema).describe("Action items for today"),
  weekend_recommendations: z
    .array(WeekendRecommendationSchema)
    .optional()
    .describe("Weekend restaurant recommendations (Thu/Fri only)"),
  notion_page_created: z
    .boolean()
    .describe("Whether the Notion page was created successfully"),
  notion_page_url: z
    .string()
    .optional()
    .describe("URL to the created Notion page"),
});

type DailyDigest = z.infer<typeof DailyDigestSchema>;

// --- Helper Functions ---

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function checkEnvironmentVariables(): Record<string, string> {
  const requiredVars = {
    COMPOSIO_GMAIL_MCP_URL: "Gmail",
    COMPOSIO_HACKERNEWS_MCP_URL: "Hacker News",
    COMPOSIO_NOTION_MCP_URL: "Notion",
    COMPOSIO_SEARCH_MCP_URL: "Search (TripAdvisor)",
  };

  const missingVars: string[] = [];
  const envVars: Record<string, string> = {};

  for (const [varName, serviceName] of Object.entries(requiredVars)) {
    const value = process.env[varName];
    if (!value) {
      missingVars.push(`  - ${varName} (for ${serviceName})`);
    } else {
      envVars[varName] = value;
    }
  }

  if (missingVars.length > 0) {
    console.error("\n❌ ERROR: Missing required environment variables!");
    console.error("\nMissing variables:");
    missingVars.forEach((v) => console.error(v));
    console.error("\nTo get your Composio MCP URLs:");
    console.error("1. Go to https://app.composio.dev/");
    console.error("2. Sign up or log in to your account");
    console.error("3. Navigate to the MCP section");
    console.error("4. Get your MCP endpoint URLs for each service");
    console.error("\nCreate a .env file in the project root with:");
    console.error("COMPOSIO_GMAIL_MCP_URL=your-gmail-url");
    console.error("COMPOSIO_HACKERNEWS_MCP_URL=your-hackernews-url");
    console.error("COMPOSIO_NOTION_MCP_URL=your-notion-url");
    console.error("COMPOSIO_SEARCH_MCP_URL=your-search-url");
    process.exit(1);
  }

  return envVars;
}

function isWeekendPlanningDay(): boolean {
  const today = new Date().getDay();
  return today === 4 || today === 5; // Thursday=4, Friday=5
}

// --- Main Function ---

async function main(): Promise<void> {
  console.log("Daily Digest Agent");
  console.log("=".repeat(60));

  // Check environment variables
  const envVars = checkEnvironmentVariables();

  // Get current date and day info
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0];
  const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
  const isWeekendPrep = isWeekendPlanningDay();

  console.log(`\nDate: ${dateStr} (${dayName})`);
  if (isWeekendPrep) {
    console.log(
      "Weekend planning mode: Will include Stockholm restaurant recommendations",
    );
  }

  // Configure MCP servers
  const composioApiKey = process.env["COMPOSIO_API_KEY"];

  // These URLs are guaranteed to exist after checkEnvironmentVariables()
  const gmailConfig = MCPconfig({
    name: "composio-gmail",
    transport: "streamable-http",
    url: envVars["COMPOSIO_GMAIL_MCP_URL"] as string,
    ...(composioApiKey && {
      headers: {
        Authorization: `Bearer ${composioApiKey}`,
      },
    }),
  });

  const hackernewsConfig = MCPconfig({
    name: "composio-hackernews",
    transport: "streamable-http",
    url: envVars["COMPOSIO_HACKERNEWS_MCP_URL"] as string,
    ...(composioApiKey && {
      headers: {
        Authorization: `Bearer ${composioApiKey}`,
      },
    }),
  });

  const notionConfig = MCPconfig({
    name: "composio-notion",
    transport: "streamable-http",
    url: envVars["COMPOSIO_NOTION_MCP_URL"] as string,
    ...(composioApiKey && {
      headers: {
        Authorization: `Bearer ${composioApiKey}`,
      },
    }),
  });

  const searchConfig = MCPconfig({
    name: "composio-search",
    transport: "streamable-http",
    url: envVars["COMPOSIO_SEARCH_MCP_URL"] as string,
    ...(composioApiKey && {
      headers: {
        Authorization: `Bearer ${composioApiKey}`,
      },
    }),
  });

  // Build instructions dynamically based on day
  let instructions = `
You are a personal productivity assistant that creates comprehensive daily digests.

Your workflow:
1. Fetch emails from the last 24 hours using Gmail tools
   - Focus on important/unread emails
   - Identify emails that require action
   - Summarize key content

2. Fetch top 10 Hacker News posts from the last day
   - Get the most upvoted posts
   - Summarize what makes them interesting
   - Note technical relevance

3. Generate action items based on emails and news
   - Extract actionable tasks from emails
   - Create follow-up actions
   - Include relevant links

4. Create a well-structured Notion page with sections in the automated notes:
   - Page title: "Daily Digest - ${dateStr}"
   - Section: "Main News last 24h" (Hacker News posts)
   - Section: "Main Email last 24h" (Email summaries)
   - Section: "Actions for today" (Action items with links)
`;

  if (isWeekendPrep) {
    instructions += `
5. WEEKEND PLANNING (Thursday/Friday only):
   - Search TripAdvisor for Stockholm restaurant recommendations
   - Focus on highly-rated restaurants with good reviews
   - Include variety of cuisines
   - Add a "Weekend Recommendations" section to the Notion page
`;
  }

  instructions += `
Guidelines:
- Be concise and actionable
- Prioritize important information
- Use clear formatting in Notion
- Include links where relevant
- Use bullet points and headings effectively
`;

  console.log("\nCreating Daily Digest Agent with multiple MCP tools...");

  // Create agent with all MCP tools
  const tools = [mcp(gmailConfig), mcp(hackernewsConfig), mcp(notionConfig)];

  // Add search tools if it's weekend planning day
  if (isWeekendPrep) {
    tools.push(mcp(searchConfig));
  }

  const agent = new Agent({
    name: "DailyDigestAgent",
    description:
      "Personal productivity assistant that creates comprehensive daily digests from emails, news, and generates actionable insights",
    instructions,
    outputSchema: DailyDigestSchema,
    tools,
    maxIterations: 30, // More iterations for complex multi-step workflow
    verbose: true,
  });

  // Hook to print agent's reasoning after each iteration
  agent.registerHook(HookEvents.LoopEnd, ({ context }) => {
    const latest = context.executionHistory.at(-1);
    if (!latest) {
      return;
    }

    const thought = latest.thought;
    if (thought?.reasoning && thought.reasoning.trim().length > 0) {
      console.log(`\n[Iteration ${latest.iteration}] ${thought.reasoning}\n`);
    }
  });

  // Build the goal dynamically
  let goal = `
Create my daily digest for ${dateStr} (${dayName}):

1. Get emails from the last 24 hours (focus on important/unread)
2. Get top 10 Hacker News posts from the last day
3. Generate action items from emails and any relevant news
4. Create a Notion page titled "Daily Digest - ${dateStr}" with:
   - Section: "Main News last 24h"
   - Section: "Main Email last 24h"
   - Section: "Actions for today"
`;

  if (isWeekendPrep) {
    goal += `
5. Search for Stockholm restaurant recommendations for the weekend
   - Use TripAdvisor or similar sources
   - Focus on highly-rated restaurants
   - Include variety of cuisines
   - Add a "Weekend Recommendations" section to the Notion page
`;
  }

  console.log(`\nGoal: ${goal}`);
  console.log("\nRunning Daily Digest Agent...");
  console.log("=".repeat(60));

  try {
    const result = await agent.process(goal);

    console.log("\n" + "=".repeat(60));
    console.log("DAILY DIGEST CREATED");
    console.log("=".repeat(60));
    console.log(`\nDate: ${result.date}`);
    console.log(`\nEmails processed: ${result.emails.length}`);
    console.log(`News items: ${result.news.length}`);
    console.log(`Action items: ${result.actions.length}`);

    if (result.weekend_recommendations) {
      console.log(
        `Weekend recommendations: ${result.weekend_recommendations.length}`,
      );
    }

    if (result.notion_page_created) {
      console.log("\nNotion page created successfully!");
      if (result.notion_page_url) {
        console.log(`URL: ${result.notion_page_url}`);
      }
    } else {
      console.log("\nWarning: Notion page creation may have failed");
    }

    console.log("\n" + "=".repeat(60));
    console.log("FULL RESULT:");
    console.log("=".repeat(60));
    console.dir(result, { depth: null });
  } catch (error) {
    console.error(`\nError: ${error}`);
    console.error("\nTroubleshooting:");
    console.error("   - Verify all Composio credentials are valid");
    console.error("   - Check that MCP endpoint URLs are correct");
    console.error("   - Ensure OPPER_API_KEY is set");
    console.error("   - Verify network connectivity");
    console.error(
      "   - Check that you have connected the required apps in Composio:",
    );
    console.error("     * Gmail account");
    console.error("     * Notion workspace");
    console.error("     * Hacker News (if required)");
    console.error("     * Search/TripAdvisor access");
    throw error;
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
