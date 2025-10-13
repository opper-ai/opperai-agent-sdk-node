import { Agent } from "opper-agents";
import { z } from "zod";

const Output = z.object({ message: z.string() });

type OutputType = z.infer<typeof Output>;

const agent = new Agent<string, OutputType>({
  name: "HelloAgent",
  instructions: "Greet the user briefly.",
  outputSchema: Output,
  // Opper accepts a list of models for fallback.
  // The SDK will forward this array as-is to Opper.
  model: ["groq/gpt-oss-120b", "gcp/gemini-flash-lite-latest"],
  verbose: true, // Enable verbose logging
});

const result = await agent.process("Say hi to Ada");
console.log(result);
// => { message: "Hi Ada!" }
