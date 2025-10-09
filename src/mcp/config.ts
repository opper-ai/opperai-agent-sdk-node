import { z } from "zod";

const MCPTransportSchema = z.enum(["stdio", "http-sse", "streamable-http"]);

const MCPBaseConfigSchema = z.object({
  name: z.string().min(1, "name is required"),
  transport: MCPTransportSchema,
  timeout: z.number().positive("timeout must be positive").default(30),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const MCPStdIoConfigSchema = MCPBaseConfigSchema.extend({
  transport: z.literal("stdio"),
  command: z.string().min(1, "command is required for stdio transport"),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  cwd: z.string().optional(),
  stderr: z
    .union([z.literal("inherit"), z.literal("pipe"), z.literal("ignore")])
    .optional(),
});

const MCPHttpSseConfigSchema = MCPBaseConfigSchema.extend({
  transport: z.literal("http-sse"),
  url: z.string().url("url must be a valid HTTP(S) URL"),
  headers: z.record(z.string(), z.string()).default({}),
  method: z.enum(["GET", "POST"]).default("GET"),
});

const MCPStreamableHttpConfigSchema = MCPBaseConfigSchema.extend({
  transport: z.literal("streamable-http"),
  url: z.string().url("url must be a valid HTTP(S) URL"),
  headers: z.record(z.string(), z.string()).default({}),
  sessionId: z.string().optional(),
});

const MCPConfigVariants = z.discriminatedUnion("transport", [
  MCPStdIoConfigSchema,
  MCPHttpSseConfigSchema,
  MCPStreamableHttpConfigSchema,
]);

export type MCPServerConfig = z.output<typeof MCPConfigVariants>;
export type MCPServerConfigInput = z.input<typeof MCPConfigVariants>;

export const MCPServerConfigSchema = MCPConfigVariants.superRefine(
  (value, ctx) => {
    if (
      value.transport === "http-sse" ||
      value.transport === "streamable-http"
    ) {
      if (!value.url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `url is required for ${value.transport} transport`,
          path: ["url"],
        });
      } else if (
        !value.url.startsWith("http://") &&
        !value.url.startsWith("https://")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "url must start with http:// or https://",
          path: ["url"],
        });
      }
    }
  },
);

export const MCPconfig = (config: MCPServerConfigInput): MCPServerConfig =>
  MCPServerConfigSchema.parse(config);

export const createMCPServerConfig = MCPconfig;
