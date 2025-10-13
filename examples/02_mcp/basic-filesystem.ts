import { Agent, MCPconfig, mcp } from "opper-agents";

/**
 * Minimal example showing how to attach an MCP server as a tool provider.
 *
 * This example expects a filesystem MCP server listening via stdio. One option
 * is the official reference server:
 *
 *   npx @modelcontextprotocol/server-filesystem /tmp
 *
 * Update the `command`/`args` fields below to match the server you have
 * available. Any tools exposed by the server immediately become available to
 * the agent once the provider connects.
 */
async function main(): Promise<void> {
  const filesystemServer = MCPconfig({
    name: "filesystem",
    transport: "stdio",
    command: "npx",
    args: ["@modelcontextprotocol/server-filesystem", "."],
    env: {
      // Prevent npm update notices from polluting stdout
      NPM_CONFIG_UPDATE_NOTIFIER: "false",
    },
  });

  const agent = new Agent<{ path: string; goal: string }, string>({
    name: "FilesystemHelper",
    description: "Uses MCP filesystem tools to inspect local files",
    instructions:
      "Use the available filesystem tools to read files and respond with their contents when helpful.",
    tools: [mcp(filesystemServer)],
    maxIterations: 10,
    verbose: true,
  });

  const result = await agent.process({
    path: "./README.md",
    goal: "Read the repository README and summarise the first few lines.",
  });

  console.log(result);
}

main().catch((error) => {
  console.error("MCP example failed", error);
  process.exitCode = 1;
});
