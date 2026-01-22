/**
 * Event system types for backwards compatibility.
 *
 * The agent.on(), agent.once(), and agent.off() methods now use the unified
 * hook system internally. These type aliases are provided for backwards
 * compatibility with existing code that imports from this module.
 *
 * @module events
 */

import {
  HookEvents,
  type HookEventName,
  type HookHandler,
  type HookPayloadMap,
} from "./hooks";

/**
 * AgentEvents is an alias for HookEvents.
 * All 17 hook events are available through agent.on() and agent.registerHook().
 */
export const AgentEvents = HookEvents;

/**
 * AgentEventName is an alias for HookEventName.
 */
export type AgentEventName = HookEventName;

/**
 * AgentEventPayloadMap is an alias for HookPayloadMap.
 */
export type AgentEventPayloadMap = HookPayloadMap;

/**
 * AgentEventPayload extracts the payload type for a specific event.
 */
export type AgentEventPayload<E extends AgentEventName> =
  AgentEventPayloadMap[E];

/**
 * AgentEventListener is an alias for HookHandler.
 * Handlers can return void or Promise<void>.
 */
export type AgentEventListener<E extends AgentEventName> = HookHandler<E>;
