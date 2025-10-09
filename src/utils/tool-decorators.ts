import type { ZodType } from "zod";

import type {
  Tool,
  ToolDefinition,
  ToolExecutionContext,
  ToolResult,
} from "../base/tool";
import { ToolResultFactory } from "../base/tool";

/**
 * Safe access to Reflect metadata API (from reflect-metadata package).
 * Returns undefined if reflect-metadata is not installed.
 */
type ReflectWithMetadata = typeof Reflect & {
  defineMetadata?: (
    metadataKey: string,
    metadataValue: unknown,
    target: object,
    propertyKey: string | symbol,
  ) => void;
  getMetadata?: (
    metadataKey: string,
    target: object,
    propertyKey: string | symbol,
  ) => unknown;
};

const reflectWithMetadata = Reflect as ReflectWithMetadata;

const ReflectMetadata = {
  define: (
    metadataKey: string,
    metadataValue: unknown,
    target: object,
    propertyKey: string | symbol,
  ): void => {
    if (typeof reflectWithMetadata.defineMetadata === "function") {
      reflectWithMetadata.defineMetadata(
        metadataKey,
        metadataValue,
        target,
        propertyKey,
      );
    }
  },

  get: (
    metadataKey: string,
    target: object,
    propertyKey: string | symbol,
  ): unknown => {
    if (typeof reflectWithMetadata.getMetadata === "function") {
      return reflectWithMetadata.getMetadata(metadataKey, target, propertyKey);
    }
    return undefined;
  },
};

const TOOL_METADATA_KEY = "opper:tool";

const toolMetadataStore = new WeakMap<
  object,
  Map<string | symbol, ToolDefinition<unknown, unknown>>
>();

function setToolMetadata<TInput, TOutput>(
  target: object,
  propertyKey: string | symbol,
  metadata: ToolDefinition<TInput, TOutput>,
): void {
  ReflectMetadata.define(TOOL_METADATA_KEY, metadata, target, propertyKey);

  let metadataForTarget = toolMetadataStore.get(target);
  if (!metadataForTarget) {
    metadataForTarget = new Map();
    toolMetadataStore.set(target, metadataForTarget);
  }

  metadataForTarget.set(
    propertyKey,
    metadata as ToolDefinition<unknown, unknown>,
  );
}

function getToolMetadata<TInput, TOutput>(
  target: object,
  propertyKey: string | symbol,
): ToolDefinition<TInput, TOutput> | undefined {
  const metadata = ReflectMetadata.get(
    TOOL_METADATA_KEY,
    target,
    propertyKey,
  ) as ToolDefinition<TInput, TOutput> | undefined;

  if (metadata) {
    return metadata;
  }

  const metadataForTarget = toolMetadataStore.get(target);
  return metadataForTarget?.get(propertyKey) as
    | ToolDefinition<TInput, TOutput>
    | undefined;
}

/**
 * Options for creating a tool from a function
 */
export interface ToolOptions<TInput> {
  /**
   * Tool name (defaults to function name)
   */
  name?: string;

  /**
   * Human-readable description
   */
  description?: string;

  /**
   * Input validation schema
   */
  schema?: ZodType<TInput>;

  /**
   * Execution timeout in milliseconds
   */
  timeoutMs?: number;

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Function that can be converted to a tool
 */
export type ToolFunction<TInput, TOutput> = (
  input: TInput,
  context: ToolExecutionContext,
) => TOutput | Promise<TOutput>;

interface CallTargetRef {
  current?: unknown;
}

type ToolMethodDecorator<TInput, TOutput> = {
  <TMethod extends ToolFunction<TInput, TOutput>>(
    value: TMethod,
    context: ClassMethodDecoratorContext<unknown, TMethod>,
  ): TMethod | void;
  (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor | undefined,
  ): PropertyDescriptor | void;
};

function isStage3DecoratorContext(
  value: unknown,
): value is ClassMethodDecoratorContext<
  unknown,
  (...args: unknown[]) => unknown
> {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in (value as Record<string, unknown>)
  );
}

function createExecuteWrapper<TInput, TOutput>(
  toolName: string,
  method: ToolFunction<TInput, TOutput>,
  options: ToolOptions<TInput>,
  callTargetRef: CallTargetRef,
): (
  input: TInput,
  context: ToolExecutionContext,
) => Promise<ToolResult<TOutput>> {
  return async (
    input: TInput,
    context: ToolExecutionContext,
  ): Promise<ToolResult<TOutput>> => {
    const startedAt = Date.now();

    try {
      if (options.schema) {
        options.schema.parse(input);
      }

      const invocationTarget = callTargetRef.current;
      const result = await Promise.resolve(
        method.call(invocationTarget, input, context),
      );

      return ToolResultFactory.success(toolName, result, {
        startedAt,
        finishedAt: Date.now(),
        ...(options.metadata && { metadata: options.metadata }),
      });
    } catch (error) {
      return ToolResultFactory.failure(
        toolName,
        error instanceof Error ? error : new Error(String(error)),
        {
          startedAt,
          finishedAt: Date.now(),
          ...(options.metadata && { metadata: options.metadata }),
        },
      );
    }
  };
}

function normalizePropertyKey(propertyKey: string | symbol): string {
  return typeof propertyKey === "symbol"
    ? (propertyKey.description ?? propertyKey.toString())
    : propertyKey;
}

function createToolDefinition<TInput, TOutput>(
  options: ToolOptions<TInput>,
  methodName: string,
  propertyKey: string | symbol,
  method: ToolFunction<TInput, TOutput>,
  callTargetRef: CallTargetRef,
): ToolDefinition<TInput, TOutput> {
  const name = options.name ?? methodName;
  const description =
    options.description ??
    extractJSDocDescription(method) ??
    `Tool: ${normalizePropertyKey(propertyKey)}`;

  return {
    name,
    description,
    ...(options.schema && { schema: options.schema }),
    ...(options.timeoutMs !== undefined && { timeoutMs: options.timeoutMs }),
    metadata: {
      ...options.metadata,
      isDecorated: true,
      propertyKey: normalizePropertyKey(propertyKey),
    },
    execute: createExecuteWrapper(name, method, options, callTargetRef),
  };
}

/**
 * Convert a function into a Tool.
 * Handles both sync and async functions, wraps execution in ToolResult.
 *
 * @param fn - Function to wrap
 * @param options - Tool configuration
 * @returns Tool definition
 *
 * @example
 * const addTool = createFunctionTool(
 *   (input: { a: number; b: number }) => input.a + input.b,
 *   {
 *     name: "add",
 *     description: "Add two numbers",
 *     schema: z.object({ a: z.number(), b: z.number() })
 *   }
 * );
 */
export function createFunctionTool<TInput, TOutput>(
  fn: ToolFunction<TInput, TOutput>,
  options: ToolOptions<TInput> = {},
): Tool<TInput, TOutput> {
  const name = options.name ?? (fn.name || "anonymous_tool");

  // Extract description from function if not provided
  const description =
    options.description ?? extractJSDocDescription(fn) ?? `Tool: ${name}`;

  const tool: Tool<TInput, TOutput> = {
    name,
    description,
    ...(options.schema && { schema: options.schema }),
    ...(options.timeoutMs !== undefined && { timeoutMs: options.timeoutMs }),
    metadata: {
      ...options.metadata,
      isFunction: true,
      functionName: fn.name,
    },
    execute: async (
      input: TInput,
      context: ToolExecutionContext,
    ): Promise<ToolResult<TOutput>> => {
      const startedAt = Date.now();

      try {
        // Validate input if schema provided
        if (options.schema) {
          options.schema.parse(input);
        }

        // Handle timeout if specified
        let result: TOutput;
        if (options.timeoutMs !== undefined) {
          result = await executeWithTimeout(
            fn(input, context),
            options.timeoutMs,
            name,
          );
        } else {
          result = await Promise.resolve(fn(input, context));
        }

        return ToolResultFactory.success(name, result, {
          startedAt,
          finishedAt: Date.now(),
          ...(options.metadata && { metadata: options.metadata }),
        });
      } catch (error) {
        return ToolResultFactory.failure(
          name,
          error instanceof Error ? error : new Error(String(error)),
          {
            startedAt,
            finishedAt: Date.now(),
            ...(options.metadata && { metadata: options.metadata }),
          },
        );
      }
    },
  };

  return tool;
}

/**
 * Decorator factory for creating tools from methods.
 * Can be used with or without arguments.
 *
 * @param options - Tool configuration
 * @returns Method decorator
 *
 * @example
 * class MyTools {
 *   @tool({ description: "Add numbers", schema: AddSchema })
 *   add(input: { a: number; b: number }): number {
 *     return input.a + input.b;
 *   }
 * }
 */
export function tool<TInput = unknown, TOutput = unknown>(
  options?: ToolOptions<TInput>,
): ToolMethodDecorator<TInput, TOutput> {
  const decoratorOptions: ToolOptions<TInput> = options ?? {};

  function decorator<TMethod extends ToolFunction<TInput, TOutput>>(
    value: TMethod,
    context: ClassMethodDecoratorContext<unknown, TMethod>,
  ): void;
  function decorator(
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor | undefined,
  ): PropertyDescriptor | void;
  function decorator(
    ...decoratorArgs:
      | [
          ToolFunction<TInput, TOutput>,
          ClassMethodDecoratorContext<unknown, ToolFunction<TInput, TOutput>>,
        ]
      | [object, string | symbol, PropertyDescriptor | undefined]
  ): PropertyDescriptor | void {
    if (
      decoratorArgs.length === 2 &&
      isStage3DecoratorContext(decoratorArgs[1])
    ) {
      const [method, context] = decoratorArgs;

      if (context.kind !== "method") {
        throw new Error("@tool can only be applied to methods.");
      }

      if (context.name === undefined) {
        throw new Error("@tool requires a named method to attach metadata.");
      }

      const propertyKey = context.name;
      const inferredName =
        typeof propertyKey === "string" && propertyKey.length > 0
          ? propertyKey
          : method.name || "anonymous_tool";

      const callTargetRef: CallTargetRef = {};
      const toolMetadata = createToolDefinition(
        decoratorOptions,
        inferredName,
        propertyKey,
        method,
        callTargetRef,
      );

      const registerMetadata = (target: object) => {
        callTargetRef.current = target;
        setToolMetadata(target, propertyKey, toolMetadata);
      };

      if (typeof context.addInitializer === "function") {
        context.addInitializer(function (this: unknown) {
          const target = context.static
            ? (this as object)
            : Object.getPrototypeOf(this);
          if (target) {
            registerMetadata(target);
          }
        });
      }

      return;
    }

    const [target, propertyKey, descriptor] = decoratorArgs as [
      object,
      string | symbol,
      PropertyDescriptor | undefined,
    ];

    const resolvedDescriptor =
      descriptor ??
      Object.getOwnPropertyDescriptor(target, propertyKey) ??
      (() => {
        const value = (target as Record<string | symbol, unknown>)[propertyKey];
        if (typeof value === "function") {
          return { value } as PropertyDescriptor;
        }
        return undefined;
      })();

    if (!resolvedDescriptor || typeof resolvedDescriptor.value !== "function") {
      throw new Error(
        `@tool can only be applied to methods, not ${typeof resolvedDescriptor?.value}`,
      );
    }

    const originalMethod = resolvedDescriptor.value as ToolFunction<
      TInput,
      TOutput
    >;
    const callTargetRef: CallTargetRef = { current: target };
    const toolMetadata = createToolDefinition(
      decoratorOptions,
      normalizePropertyKey(propertyKey),
      propertyKey,
      originalMethod,
      callTargetRef,
    );

    setToolMetadata(target, propertyKey, toolMetadata);

    return resolvedDescriptor;
  }

  return decorator;
}

/**
 * Extract all tools defined via @tool decorator from a class instance
 *
 * @param instance - Class instance with @tool decorated methods
 * @returns Array of Tool definitions
 *
 * @example
 * class MyTools {
 *   @tool() greet(input: { name: string }) { return `Hello ${input.name}`; }
 * }
 *
 * const tools = extractTools(new MyTools());
 */
export function extractTools(instance: object): Array<Tool<unknown, unknown>> {
  const tools: Array<Tool<unknown, unknown>> = [];
  const prototype = Object.getPrototypeOf(instance) as object;

  // Get all property names from the prototype
  const propertyKeys: Array<string | symbol> = [
    ...Object.getOwnPropertyNames(prototype),
    ...Object.getOwnPropertySymbols(prototype),
  ];

  for (const propertyKey of propertyKeys) {
    if (propertyKey === "constructor") continue;

    // Check if this property has tool metadata
    const toolMetadata = getToolMetadata(prototype, propertyKey) as
      | ToolDefinition<unknown, unknown>
      | undefined;

    if (toolMetadata) {
      // Get the actual method from the instance and create a properly bound tool
      const instanceMethod = (instance as Record<string | symbol, unknown>)[
        propertyKey
      ];

      if (typeof instanceMethod !== "function") {
        continue;
      }

      const tool: Tool<unknown, unknown> = {
        ...toolMetadata,
        execute: async (input: unknown, context: ToolExecutionContext) => {
          // Re-execute the tool logic but with the instance method properly bound
          const startedAt = Date.now();

          try {
            // Validate if schema exists
            if (toolMetadata.schema) {
              toolMetadata.schema.parse(input);
            }

            const result = await Promise.resolve(
              instanceMethod.call(instance, input, context),
            );

            return ToolResultFactory.success(toolMetadata.name, result, {
              startedAt,
              finishedAt: Date.now(),
              ...(toolMetadata.metadata && { metadata: toolMetadata.metadata }),
            });
          } catch (error) {
            return ToolResultFactory.failure(
              toolMetadata.name,
              error instanceof Error ? error : new Error(String(error)),
              {
                startedAt,
                finishedAt: Date.now(),
                ...(toolMetadata.metadata && {
                  metadata: toolMetadata.metadata,
                }),
              },
            );
          }
        },
      };

      tools.push(tool);
    }
  }

  return tools;
}

/**
 * Execute a promise with a timeout
 *
 * @param promise - Promise to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param toolName - Tool name for error messages
 * @returns Result or throws timeout error
 */
async function executeWithTimeout<T>(
  promise: T | Promise<T>,
  timeoutMs: number,
  toolName: string,
): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Tool "${toolName}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Attempt to extract description from JSDoc comment.
 * Note: This is a best-effort attempt and may not work in all cases.
 *
 * @param fn - Function to extract description from
 * @returns Description or undefined
 */
function extractJSDocDescription(fn: {
  toString(): string;
}): string | undefined {
  const source = fn.toString();
  const match = /\/\*\*\s*\n\s*\*\s*(.+?)\s*\n/.exec(source);
  return match?.[1];
}
