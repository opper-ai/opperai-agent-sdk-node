import type { AgentContext } from "./context";
import type { Tool, ToolCallRecord, ToolResult } from "./tool";
import type {
  OpperCallResponse,
  OpperStreamResponse,
} from "../opper/client";
import type { AgentLogger } from "../utils/logger";
import { getDefaultLogger } from "../utils/logger";

/** The two LLM call phases in the agent loop */
export type LlmCallType = "think" | "final_result";

/** Thought summary emitted by the ThinkEnd hook */
export interface AgentThought {
  reasoning: string;
  userMessage: string;
}

export const HookEvents = {
  AgentStart: "agent:start",
  AgentEnd: "agent:end",
  LoopStart: "loop:start",
  LoopEnd: "loop:end",
  LlmCall: "llm:call",
  LlmResponse: "llm:response",
  ThinkEnd: "think:end",
  BeforeTool: "tool:before",
  AfterTool: "tool:after",
  ToolError: "tool:error",
  MemoryRead: "memory:read",
  MemoryWrite: "memory:write",
  MemoryError: "memory:error",
  StreamStart: "stream:start",
  StreamChunk: "stream:chunk",
  StreamEnd: "stream:end",
  StreamError: "stream:error",
} as const;

export type HookEventName = (typeof HookEvents)[keyof typeof HookEvents];

export interface HookPayloadMap {
  [HookEvents.AgentStart]: {
    context: AgentContext;
  };
  [HookEvents.AgentEnd]: {
    context: AgentContext;
    result?: unknown;
    error?: unknown;
  };
  [HookEvents.LoopStart]: {
    context: AgentContext;
  };
  [HookEvents.LoopEnd]: {
    context: AgentContext;
  };
  [HookEvents.LlmCall]: {
    context: AgentContext;
    callType: LlmCallType;
  };
  [HookEvents.LlmResponse]: {
    context: AgentContext;
    callType: LlmCallType;
    response: OpperCallResponse | OpperStreamResponse;
    parsed?: unknown;
  };
  [HookEvents.ThinkEnd]: {
    context: AgentContext;
    thought: AgentThought;
  };
  [HookEvents.BeforeTool]: {
    context: AgentContext;
    tool: Tool<unknown, unknown>;
    input: unknown;
    toolCallId: string;
  };
  [HookEvents.AfterTool]: {
    context: AgentContext;
    tool: Tool<unknown, unknown>;
    result: ToolResult<unknown>;
    record: ToolCallRecord;
  };
  [HookEvents.ToolError]: {
    context: AgentContext;
    toolName: string;
    tool?: Tool<unknown, unknown>;
    error: unknown;
    toolCallId: string;
  };
  [HookEvents.MemoryRead]: {
    context: AgentContext;
    key: string;
    value: unknown;
  };
  [HookEvents.MemoryWrite]: {
    context: AgentContext;
    key: string;
    value: unknown;
  };
  [HookEvents.MemoryError]: {
    context: AgentContext;
    operation: "read" | "write" | "delete" | "clear";
    error: unknown;
  };
  [HookEvents.StreamStart]: {
    context: AgentContext;
    callType: LlmCallType;
  };
  [HookEvents.StreamChunk]: {
    context: AgentContext;
    callType: LlmCallType;
    chunkData: {
      delta: string | number | boolean | null | undefined;
      jsonPath?: string | null;
      chunkType?: string | null;
    };
    accumulated: string;
    fieldBuffers: Record<string, string>;
  };
  [HookEvents.StreamEnd]: {
    context: AgentContext;
    callType: LlmCallType;
    fieldBuffers: Record<string, string>;
  };
  [HookEvents.StreamError]: {
    context: AgentContext;
    callType: LlmCallType;
    error: unknown;
  };
}

export type HookPayload<E extends HookEventName> = HookPayloadMap[E];

// Named payload exports for convenient consumer imports
export type AgentStartPayload = HookPayloadMap[typeof HookEvents.AgentStart];
export type AgentEndPayload = HookPayloadMap[typeof HookEvents.AgentEnd];
export type LoopStartPayload = HookPayloadMap[typeof HookEvents.LoopStart];
export type LoopEndPayload = HookPayloadMap[typeof HookEvents.LoopEnd];
export type LlmCallPayload = HookPayloadMap[typeof HookEvents.LlmCall];
export type LlmResponsePayload = HookPayloadMap[typeof HookEvents.LlmResponse];
export type ThinkEndPayload = HookPayloadMap[typeof HookEvents.ThinkEnd];
export type BeforeToolPayload = HookPayloadMap[typeof HookEvents.BeforeTool];
export type AfterToolPayload = HookPayloadMap[typeof HookEvents.AfterTool];
export type ToolErrorPayload = HookPayloadMap[typeof HookEvents.ToolError];
export type MemoryReadPayload = HookPayloadMap[typeof HookEvents.MemoryRead];
export type MemoryWritePayload = HookPayloadMap[typeof HookEvents.MemoryWrite];
export type MemoryErrorPayload = HookPayloadMap[typeof HookEvents.MemoryError];
export type StreamStartPayload = HookPayloadMap[typeof HookEvents.StreamStart];
export type StreamChunkPayload = HookPayloadMap[typeof HookEvents.StreamChunk];
export type StreamEndPayload = HookPayloadMap[typeof HookEvents.StreamEnd];
export type StreamErrorPayload = HookPayloadMap[typeof HookEvents.StreamError];

export type HookHandler<E extends HookEventName> = (
  payload: HookPayload<E>,
) => void | Promise<void>;

export interface HookRegistration<E extends HookEventName> {
  event: E;
  handler: HookHandler<E>;
}

export type UnregisterHook = () => void;

export class HookManager {
  private readonly registry = new Map<
    HookEventName,
    Set<HookHandler<HookEventName>>
  >();
  private readonly logger: AgentLogger;

  constructor(logger?: AgentLogger) {
    this.logger = logger ?? getDefaultLogger();
  }

  public on<E extends HookEventName>(
    event: E,
    handler: HookHandler<E>,
  ): UnregisterHook {
    const existing =
      this.registry.get(event) ?? new Set<HookHandler<HookEventName>>();
    existing.add(handler as HookHandler<HookEventName>);
    this.registry.set(event, existing);
    return () => existing.delete(handler as HookHandler<HookEventName>);
  }

  public once<E extends HookEventName>(
    event: E,
    handler: HookHandler<E>,
  ): UnregisterHook {
    const disposable: HookHandler<E> = async (payload) => {
      await handler(payload);
      this.off(event, disposable);
    };
    return this.on(event, disposable);
  }

  public off<E extends HookEventName>(event: E, handler: HookHandler<E>): void {
    const listeners = this.registry.get(event);
    if (!listeners) {
      return;
    }
    listeners.delete(handler as HookHandler<HookEventName>);
    if (listeners.size === 0) {
      this.registry.delete(event);
    }
  }

  public clear(): void {
    this.registry.clear();
  }

  public listenerCount(event?: HookEventName): number {
    if (event) {
      return this.registry.get(event)?.size ?? 0;
    }

    let total = 0;
    for (const listeners of this.registry.values()) {
      total += listeners.size;
    }
    return total;
  }

  public async emit<E extends HookEventName>(
    event: E,
    payload: HookPayload<E>,
  ): Promise<void> {
    const listeners = Array.from(
      (this.registry.get(event) as Set<HookHandler<E>> | undefined) ??
        new Set<HookHandler<E>>(),
    );

    if (listeners.length === 0) {
      return;
    }

    // Execute handlers sequentially but continue even if some fail
    for (const [index, listener] of listeners.entries()) {
      try {
        await Promise.resolve(listener(payload));
      } catch (error) {
        // Log failure without throwing
        this.logger.warn(`Hook handler failed for event "${event}"`, {
          event,
          handlerIndex: index,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  public registerMany<E extends HookEventName>(
    registrations: HookRegistration<E>[],
  ): UnregisterHook {
    const cleanups = registrations.map(({ event, handler }) =>
      this.on(event, handler),
    );
    return () => cleanups.forEach((dispose) => dispose());
  }
}

export const createHookManager = (logger?: AgentLogger): HookManager =>
  new HookManager(logger);
