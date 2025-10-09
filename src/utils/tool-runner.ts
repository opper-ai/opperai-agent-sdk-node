import type { AgentContext } from "../base/context";
import type { Tool, ToolExecutionContext, ToolResult } from "../base/tool";
import { ToolResultFactory } from "../base/tool";

/**
 * Options for tool execution
 */
export interface ToolRunOptions {
  /**
   * Abort signal for cancellation
   */
  signal?: AbortSignal;

  /**
   * Additional metadata to pass to the tool
   */
  metadata?: Record<string, unknown>;

  /**
   * Override timeout for this execution
   */
  timeoutMs?: number;
}

/**
 * Utility class for executing tools with validation and error handling
 */
export class ToolRunner {
  /**
   * Execute a tool with the given input and context
   *
   * @param tool - Tool to execute
   * @param input - Input data
   * @param context - Agent execution context
   * @param options - Execution options
   * @returns Tool execution result
   */
  public static async execute<TInput, TOutput>(
    tool: Tool<TInput, TOutput>,
    input: TInput,
    context: AgentContext,
    options: ToolRunOptions = {},
  ): Promise<ToolResult<TOutput>> {
    // Check for cancellation
    if (options.signal?.aborted) {
      return ToolResultFactory.failure(
        tool.name,
        new Error(`Tool "${tool.name}" execution was aborted`),
      );
    }

    // Validate input against schema if provided
    if (tool.schema) {
      const validation = tool.schema.safeParse(input);
      if (!validation.success) {
        return ToolResultFactory.failure(
          tool.name,
          new Error(
            `Invalid input for tool "${tool.name}": ${validation.error.message}`,
          ),
        );
      }
    }

    const executionContext: ToolExecutionContext = {
      agentContext: context,
      ...(options.signal && { signal: options.signal }),
      metadata: options.metadata ?? {},
    };

    try {
      // Determine timeout: option override > tool default > no timeout
      const timeoutMs = options.timeoutMs ?? tool.timeoutMs;

      let result: ToolResult<TOutput>;

      if (timeoutMs !== undefined) {
        // Execute with timeout
        result = await this.executeWithTimeout(
          Promise.resolve(tool.execute(input, executionContext)),
          timeoutMs,
          tool.name,
        );
      } else {
        // Execute without timeout
        result = await Promise.resolve(tool.execute(input, executionContext));
      }

      return result;
    } catch (error) {
      return ToolResultFactory.failure(
        tool.name,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Execute multiple tools in parallel
   *
   * @param executions - Array of tool execution tuples [tool, input, context, options?]
   * @returns Array of results in same order as input
   */
  public static async executeParallel<TInput, TOutput>(
    executions: Array<
      [Tool<TInput, TOutput>, TInput, AgentContext, ToolRunOptions?]
    >,
  ): Promise<Array<ToolResult<TOutput>>> {
    return Promise.all(
      executions.map(([tool, input, context, options]) =>
        this.execute(tool, input, context, options),
      ),
    );
  }

  /**
   * Execute multiple tools sequentially, stopping on first failure
   *
   * @param executions - Array of tool execution tuples
   * @returns Array of results up to first failure (inclusive)
   */
  public static async executeSequential<TInput, TOutput>(
    executions: Array<
      [Tool<TInput, TOutput>, TInput, AgentContext, ToolRunOptions?]
    >,
  ): Promise<Array<ToolResult<TOutput>>> {
    const results: Array<ToolResult<TOutput>> = [];

    for (const [tool, input, context, options] of executions) {
      const result = await this.execute(tool, input, context, options);
      results.push(result);

      if (!result.success) {
        break; // Stop on first failure
      }
    }

    return results;
  }

  /**
   * Execute a tool with timeout
   *
   * @param promise - Tool execution promise
   * @param timeoutMs - Timeout in milliseconds
   * @param toolName - Tool name for error messages
   * @returns Result or rejects with timeout error
   */
  private static async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    toolName: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(`Tool "${toolName}" timed out after ${timeoutMs}ms`),
          );
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * Validate tool input without executing
   *
   * @param tool - Tool to validate input for
   * @param input - Input to validate
   * @returns true if valid, Error if invalid
   */
  public static validate<TInput>(
    tool: Tool<TInput, unknown>,
    input: TInput,
  ): true | Error {
    if (!tool.schema) {
      return true; // No schema means no validation needed
    }

    const validation = tool.schema.safeParse(input);
    if (!validation.success) {
      return new Error(
        `Invalid input for tool "${tool.name}": ${validation.error.message}`,
      );
    }

    return true;
  }

  /**
   * Check if a result indicates success
   *
   * @param result - Tool result to check
   * @returns true if success, false if failure
   */
  public static isSuccess<TOutput>(result: ToolResult<TOutput>): result is {
    success: true;
    toolName: string;
    output: TOutput;
    metadata: Record<string, unknown>;
    startedAt?: number;
    finishedAt?: number;
  } {
    return result.success === true;
  }

  /**
   * Check if a result indicates failure
   *
   * @param result - Tool result to check
   * @returns true if failure, false if success
   */
  public static isFailure<TOutput>(result: ToolResult<TOutput>): result is {
    success: false;
    toolName: string;
    error: Error | string;
    metadata: Record<string, unknown>;
    startedAt?: number;
    finishedAt?: number;
  } {
    return result.success === false;
  }
}
