import { HookEvents, type HookPayloadMap } from "./hooks";
import type { AgentLogger } from "../utils/logger";
import { getDefaultLogger } from "../utils/logger";

export const AgentEvents = {
  StreamStart: HookEvents.StreamStart,
  StreamChunk: HookEvents.StreamChunk,
  StreamEnd: HookEvents.StreamEnd,
  StreamError: HookEvents.StreamError,
} as const;

export type AgentEventName = (typeof AgentEvents)[keyof typeof AgentEvents];

export type AgentEventPayloadMap = Pick<HookPayloadMap, AgentEventName>;

export type AgentEventPayload<E extends AgentEventName> =
  AgentEventPayloadMap[E];

export type AgentEventListener<E extends AgentEventName> = (
  payload: AgentEventPayload<E>,
) => void;

export class AgentEventEmitter {
  private readonly registry = new Map<
    AgentEventName,
    Set<AgentEventListener<AgentEventName>>
  >();
  private readonly logger: AgentLogger;

  constructor(logger?: AgentLogger) {
    this.logger = logger ?? getDefaultLogger();
  }

  public on<E extends AgentEventName>(
    event: E,
    listener: AgentEventListener<E>,
  ): () => void {
    const listeners =
      this.registry.get(event) ?? new Set<AgentEventListener<AgentEventName>>();
    listeners.add(listener as AgentEventListener<AgentEventName>);
    this.registry.set(event, listeners);
    return () => this.off(event, listener);
  }

  public once<E extends AgentEventName>(
    event: E,
    listener: AgentEventListener<E>,
  ): () => void {
    const wrapper: AgentEventListener<E> = (payload) => {
      try {
        listener(payload);
      } finally {
        this.off(event, wrapper);
      }
    };
    return this.on(event, wrapper);
  }

  public off<E extends AgentEventName>(
    event: E,
    listener: AgentEventListener<E>,
  ): void {
    const listeners = this.registry.get(event);
    if (!listeners) {
      return;
    }
    listeners.delete(listener as AgentEventListener<AgentEventName>);
    if (listeners.size === 0) {
      this.registry.delete(event);
    }
  }

  public emit<E extends AgentEventName>(
    event: E,
    payload: AgentEventPayload<E>,
  ): void {
    const listeners = Array.from(
      (this.registry.get(event) as
        | Set<AgentEventListener<E>>
        | undefined) ?? new Set<AgentEventListener<E>>(),
    );

    if (listeners.length === 0) {
      return;
    }

    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (error) {
        this.logger.warn(`Agent event listener failed for "${event}"`, {
          event,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  public removeAllListeners(event?: AgentEventName): void {
    if (event) {
      this.registry.delete(event);
      return;
    }
    this.registry.clear();
  }

  public listenerCount(event?: AgentEventName): number {
    if (event) {
      return this.registry.get(event)?.size ?? 0;
    }

    let total = 0;
    for (const listeners of this.registry.values()) {
      total += listeners.size;
    }
    return total;
  }
}
