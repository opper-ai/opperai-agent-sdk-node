import "reflect-metadata";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AgentContext } from "@/base/context";
import type { ToolExecutionContext } from "@/base/tool";
import {
  createFunctionTool,
  extractTools,
  tool,
  type ToolFunction,
} from "@/utils/tool-decorators";

describe("createFunctionTool", () => {
  describe("Basic function wrapping", () => {
    it("wraps a sync function as a tool", async () => {
      const add: ToolFunction<{ a: number; b: number }, number> = (input) =>
        input.a + input.b;

      const addTool = createFunctionTool(add, {
        name: "add",
        description: "Add two numbers",
      });

      expect(addTool.name).toBe("add");
      expect(addTool.description).toBe("Add two numbers");

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const executionContext: ToolExecutionContext = {
        agentContext: context,
        metadata: {},
      };

      const result = await addTool.execute({ a: 2, b: 3 }, executionContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toBe(5);
      }
    });

    it("wraps an async function as a tool", async () => {
      const fetchData: ToolFunction<{ id: string }, string> = async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return `Data for ${input.id}`;
      };

      const fetchTool = createFunctionTool(fetchData, {
        name: "fetch",
        description: "Fetch data",
      });

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const executionContext: ToolExecutionContext = {
        agentContext: context,
        metadata: {},
      };

      const result = await fetchTool.execute({ id: "123" }, executionContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toBe("Data for 123");
      }
    });

    it("uses function name as default tool name", () => {
      function myFunction(input: { value: string }) {
        return input.value.toUpperCase();
      }

      const tool = createFunctionTool(myFunction);

      expect(tool.name).toBe("myFunction");
    });

    it("falls back to 'anonymous_tool' for anonymous functions", () => {
      const tool = createFunctionTool((input: { value: string }) =>
        input.value.toLowerCase(),
      );

      expect(tool.name).toBe("anonymous_tool");
    });
  });

  describe("Schema validation", () => {
    it("validates input with zod schema", async () => {
      const schema = z.object({
        name: z.string().min(1),
        age: z.number().min(0),
      });

      const greet: ToolFunction<{ name: string; age: number }, string> = (
        input,
      ) => `Hello ${input.name}, age ${input.age}`;

      const greetTool = createFunctionTool(greet, {
        name: "greet",
        schema,
      });

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const executionContext: ToolExecutionContext = {
        agentContext: context,
        metadata: {},
      };

      const result = await greetTool.execute(
        { name: "Alice", age: 30 },
        executionContext,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toBe("Hello Alice, age 30");
      }
    });

    it("returns failure for invalid input", async () => {
      const schema = z.object({
        value: z.number().positive(),
      });

      const tool = createFunctionTool(
        (input: { value: number }) => input.value * 2,
        { name: "double", schema },
      );

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const executionContext: ToolExecutionContext = {
        agentContext: context,
        metadata: {},
      };

      const result = await tool.execute(
        { value: -5 } as never,
        executionContext,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });
  });

  describe("Error handling", () => {
    it("catches and wraps sync errors", async () => {
      const failingTool = createFunctionTool(
        () => {
          throw new Error("Sync error");
        },
        { name: "failing" },
      );

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const executionContext: ToolExecutionContext = {
        agentContext: context,
        metadata: {},
      };

      const result = await failingTool.execute({}, executionContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
        const error = result.error as Error;
        expect(error.message).toBe("Sync error");
      }
    });

    it("catches and wraps async errors", async () => {
      const failingTool = createFunctionTool(
        async () => {
          throw new Error("Async error");
        },
        { name: "failing" },
      );

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const executionContext: ToolExecutionContext = {
        agentContext: context,
        metadata: {},
      };

      const result = await failingTool.execute({}, executionContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
        const error = result.error as Error;
        expect(error.message).toBe("Async error");
      }
    });

    it("converts non-Error throws to Error objects", async () => {
      const failingTool = createFunctionTool(
        () => {
          throw "String error";
        },
        { name: "failing" },
      );

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const executionContext: ToolExecutionContext = {
        agentContext: context,
        metadata: {},
      };

      const result = await failingTool.execute({}, executionContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });
  });

  describe("Timeout handling", () => {
    it("enforces timeout on slow functions", async () => {
      const slowTool = createFunctionTool(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return "Done";
        },
        {
          name: "slow",
          timeoutMs: 50,
        },
      );

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const executionContext: ToolExecutionContext = {
        agentContext: context,
        metadata: {},
      };

      const result = await slowTool.execute({}, executionContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as Error;
        expect(error.message).toContain("timed out");
      }
    });

    it("completes fast functions within timeout", async () => {
      const fastTool = createFunctionTool(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return "Done";
        },
        {
          name: "fast",
          timeoutMs: 100,
        },
      );

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const executionContext: ToolExecutionContext = {
        agentContext: context,
        metadata: {},
      };

      const result = await fastTool.execute({}, executionContext);

      expect(result.success).toBe(true);
    });
  });

  describe("Metadata", () => {
    it("includes custom metadata in tool definition", () => {
      const tool = createFunctionTool(
        (input: { value: string }) => input.value,
        {
          name: "test",
          metadata: { category: "text", version: "1.0" },
        },
      );

      expect(tool.metadata?.["category"]).toBe("text");
      expect(tool.metadata?.["version"]).toBe("1.0");
      expect(tool.metadata?.["isFunction"]).toBe(true);
    });

    it("includes function name in metadata", () => {
      function namedFunction(input: { value: string }) {
        return input.value;
      }

      const tool = createFunctionTool(namedFunction, { name: "test" });

      expect(tool.metadata?.["functionName"]).toBe("namedFunction");
    });
  });

  describe("Output schema and examples", () => {
    it("includes outputSchema in tool definition", () => {
      const inputSchema = z.object({
        a: z.number(),
        b: z.number(),
      });
      const outputSchema = z.number();

      type Input = z.infer<typeof inputSchema>;
      type Output = z.infer<typeof outputSchema>;

      const addTool = createFunctionTool(
        (input: Input): Output => input.a + input.b,
        {
          name: "add",
          description: "Add two numbers",
          schema: inputSchema,
          outputSchema: outputSchema,
        },
      );

      expect(addTool.outputSchema).toBeDefined();
      expect(addTool.outputSchema).toBe(outputSchema);
    });

    it("includes examples in tool definition", () => {
      const inputSchema = z.object({
        a: z.number(),
        b: z.number(),
      });
      const outputSchema = z.number();

      type Input = z.infer<typeof inputSchema>;
      type Output = z.infer<typeof outputSchema>;

      const examples = [
        { input: { a: 2, b: 3 }, output: 5, description: "Basic addition" },
        { input: { a: -1, b: 1 }, output: 0, description: "Adding opposites" },
      ];

      const addTool = createFunctionTool(
        (input: Input): Output => input.a + input.b,
        {
          name: "add",
          schema: inputSchema,
          outputSchema: outputSchema,
          examples: examples,
        },
      );

      expect(addTool.examples).toBeDefined();
      expect(addTool.examples).toHaveLength(2);
      expect(addTool.examples?.[0]).toEqual({
        input: { a: 2, b: 3 },
        output: 5,
        description: "Basic addition",
      });
    });

    it("works with structured output schema", () => {
      const inputSchema = z.object({
        numerator: z.number(),
        denominator: z.number(),
      });
      const outputSchema = z.object({
        quotient: z.number(),
        remainder: z.number(),
      });

      type Input = z.infer<typeof inputSchema>;
      type Output = z.infer<typeof outputSchema>;

      const divideTool = createFunctionTool(
        (input: Input): Output => ({
          quotient: Math.floor(input.numerator / input.denominator),
          remainder: input.numerator % input.denominator,
        }),
        {
          name: "divide",
          schema: inputSchema,
          outputSchema: outputSchema,
          examples: [
            {
              input: { numerator: 10, denominator: 3 },
              output: { quotient: 3, remainder: 1 },
              description: "Division with remainder",
            },
          ],
        },
      );

      expect(divideTool.outputSchema).toBe(outputSchema);
      expect(divideTool.examples?.[0]?.output).toEqual({
        quotient: 3,
        remainder: 1,
      });
    });
  });
});

describe("@tool decorator", () => {
  describe("Basic decoration", () => {
    it("decorates a method and extracts it as a tool", () => {
      class Calculator {
        @tool({ name: "add", description: "Add two numbers" })
        add(input: { a: number; b: number }): number {
          return input.a + input.b;
        }
      }

      const calc = new Calculator();
      const tools = extractTools(calc);

      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe("add");
      expect(tools[0]?.description).toBe("Add two numbers");
    });

    it("uses property name as default tool name", () => {
      class Tools {
        @tool()
        multiply(input: { a: number; b: number }): number {
          return input.a * input.b;
        }
      }

      const instance = new Tools();
      const tools = extractTools(instance);

      expect(tools[0]?.name).toBe("multiply");
    });

    it("preserves method behavior", () => {
      class Tools {
        @tool({ name: "greet" })
        greet(input: { name: string }): string {
          return `Hello, ${input.name}!`;
        }
      }

      const instance = new Tools();
      const result = instance.greet({ name: "Alice" });

      expect(result).toBe("Hello, Alice!");
    });
  });

  describe("Tool execution", () => {
    it("executes decorated methods as tools", async () => {
      class MathTools {
        @tool({ name: "square" })
        square(input: { x: number }): number {
          return input.x * input.x;
        }
      }

      const mathTools = new MathTools();
      const tools = extractTools(mathTools);
      const squareTool = tools[0];

      if (!squareTool) {
        throw new Error("Tool not found");
      }

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const executionContext: ToolExecutionContext = {
        agentContext: context,
        metadata: {},
      };

      const result = await squareTool.execute({ x: 5 }, executionContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toBe(25);
      }
    });

    it("handles async decorated methods", async () => {
      class AsyncTools {
        @tool({ name: "delayed" })
        async delayed(input: { ms: number }): Promise<string> {
          await new Promise((resolve) => setTimeout(resolve, input.ms));
          return "Done";
        }
      }

      const asyncTools = new AsyncTools();
      const tools = extractTools(asyncTools);
      const delayedTool = tools[0];

      if (!delayedTool) {
        throw new Error("Tool not found");
      }

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const executionContext: ToolExecutionContext = {
        agentContext: context,
        metadata: {},
      };

      const result = await delayedTool.execute({ ms: 10 }, executionContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toBe("Done");
      }
    });
  });

  describe("Error handling", () => {
    it("catches errors in decorated methods", async () => {
      class FailingTools {
        @tool({ name: "fail" })
        fail(): never {
          throw new Error("Method error");
        }
      }

      const failingTools = new FailingTools();
      const tools = extractTools(failingTools);
      const failTool = tools[0];

      if (!failTool) {
        throw new Error("Tool not found");
      }

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const executionContext: ToolExecutionContext = {
        agentContext: context,
        metadata: {},
      };

      const result = await failTool.execute({}, executionContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error as Error;
        expect(error.message).toBe("Method error");
      }
    });
  });

  describe("Schema validation", () => {
    it("validates input with provided schema", async () => {
      const PersonSchema = z.object({
        name: z.string(),
        age: z.number().min(0),
      });

      class ValidationTools {
        @tool({ name: "validate", schema: PersonSchema })
        validate(input: { name: string; age: number }): string {
          return `${input.name} is ${input.age} years old`;
        }
      }

      const validationTools = new ValidationTools();
      const tools = extractTools(validationTools);
      const validateTool = tools[0];

      if (!validateTool) {
        throw new Error("Tool not found");
      }

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const executionContext: ToolExecutionContext = {
        agentContext: context,
        metadata: {},
      };

      // Valid input
      const validResult = await validateTool.execute(
        { name: "Bob", age: 25 },
        executionContext,
      );
      expect(validResult.success).toBe(true);

      // Invalid input
      const invalidResult = await validateTool.execute(
        { name: "Bob", age: -5 } as never,
        executionContext,
      );
      expect(invalidResult.success).toBe(false);
    });
  });

  describe("Multiple tools", () => {
    it("extracts multiple decorated methods", () => {
      class MultiTools {
        @tool({ name: "tool1" })
        method1(): string {
          return "one";
        }

        @tool({ name: "tool2" })
        method2(): string {
          return "two";
        }

        @tool({ name: "tool3" })
        method3(): string {
          return "three";
        }

        // Non-decorated method
        regularMethod(): string {
          return "regular";
        }
      }

      const multiTools = new MultiTools();
      const tools = extractTools(multiTools);

      expect(tools).toHaveLength(3);
      expect(tools.map((t) => t.name)).toEqual(["tool1", "tool2", "tool3"]);
    });
  });

  describe("Instance binding", () => {
    it("preserves instance context in decorated methods", async () => {
      class StatefulTools {
        private counter = 0;

        @tool({ name: "increment" })
        increment(): number {
          return ++this.counter;
        }
      }

      const statefulTools = new StatefulTools();
      const tools = extractTools(statefulTools);
      const incrementTool = tools[0];

      if (!incrementTool) {
        throw new Error("Tool not found");
      }

      const context = new AgentContext({ agentName: "test", goal: "test" });
      const executionContext: ToolExecutionContext = {
        agentContext: context,
        metadata: {},
      };

      // First call
      const result1 = await incrementTool.execute({}, executionContext);
      expect(result1.success).toBe(true);
      if (result1.success) {
        expect(result1.output).toBe(1);
      }

      // Second call
      const result2 = await incrementTool.execute({}, executionContext);
      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.output).toBe(2);
      }
    });
  });
});

describe("extractTools", () => {
  it("returns empty array for class with no decorated methods", () => {
    class EmptyClass {}

    const tools = extractTools(new EmptyClass());
    expect(tools).toEqual([]);
  });

  it("ignores constructor", () => {
    class WithConstructor {
      constructor() {
        // Constructor should be ignored
      }

      @tool({ name: "test" })
      test(): string {
        return "test";
      }
    }

    const tools = extractTools(new WithConstructor());
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("test");
  });
});
