import { describe, expect, it, vi } from "vitest";

import { BaseAgent } from "@/base/agent";
import { AgentContext } from "@/base/context";
import type { Tool, ToolProvider } from "@/base/tool";
import { ToolResultFactory } from "@/base/tool";

class TestAgent extends BaseAgent<string, string> {
  protected async runLoop(
    input: string,
    context: AgentContext,
  ): Promise<string> {
    void context;
    return input ? "ok" : "ok";
  }
}

class StubProvider implements ToolProvider {
  public readonly setup = vi.fn(async () => {
    const tool: Tool<unknown, unknown> = {
      name: "stub:echo",
      description: "Echo input",
      execute: async (input) =>
        ToolResultFactory.success("stub:echo", input ?? null),
    };
    return [tool];
  });

  public readonly teardown = vi.fn(async () => {});
}

describe("BaseAgent tool providers", () => {
  it("activates and deactivates tool providers during process", async () => {
    const provider = new StubProvider();
    const agent = new TestAgent({
      name: "test",
      tools: [provider],
    });

    const result = await agent.process("hello");

    expect(result).toBe("ok");
    expect(provider.setup).toHaveBeenCalledTimes(1);
    expect(provider.teardown).toHaveBeenCalledTimes(1);
    expect(agent.getTools().some((tool) => tool.name === "stub:echo")).toBe(
      false,
    );
  });
});
