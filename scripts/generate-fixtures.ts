#!/usr/bin/env tsx
/**
 * Script to generate test fixtures by making real calls to Opper API
 *
 * Usage:
 *   OPPER_HTTP_BEARER=your_api_key tsx scripts/generate-fixtures.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Opper } from "opperai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, "../tests/fixtures/opper");

// Ensure fixtures directory exists
mkdirSync(FIXTURES_DIR, { recursive: true });

function saveFixture(name: string, data: unknown): void {
  const path = join(FIXTURES_DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  console.log(`✓ Saved fixture: ${name}.json`);
}

async function main() {
  const apiKey = process.env.OPPER_HTTP_BEARER;

  if (!apiKey) {
    console.error("Error: OPPER_HTTP_BEARER environment variable is required");
    console.error(
      "Usage: OPPER_HTTP_BEARER=your_api_key tsx scripts/generate-fixtures.ts",
    );
    process.exit(1);
  }

  console.log("Generating fixtures from real Opper API calls...\n");

  const opper = new Opper({ httpBearer: apiKey });

  try {
    // 1. Basic call - simple question/answer
    console.log("1. Making basic call...");
    const basicCall = await opper.call({
      name: "basic_question",
      instructions:
        "Answer the question with just the city name, no extra words",
      input: "What is the capital of France?",
    });
    saveFixture("call-basic", basicCall);

    // 2. Structured call - with input and output schemas
    console.log("2. Making structured call with schemas...");
    const structuredCall = await opper.call({
      name: "extract_room_details",
      instructions: "Extract the room details from the text",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "A text containing information about a hotel room",
          },
        },
        required: ["text"],
      },
      outputSchema: {
        type: "object",
        properties: {
          thoughts: {
            type: "string",
            description:
              "The thoughts of the model while extracting the room details",
          },
          beds: {
            type: "number",
            description: "The number of people who can sleep in this room",
          },
          seaview: {
            type: "boolean",
            description: "Whether the room has a view to the sea",
          },
          description: {
            type: "string",
            description: "A description of the room and its features",
          },
        },
        required: ["thoughts", "beds", "seaview", "description"],
      },
      input: {
        text: "Suite at Grand Hotel with two rooms. A master bedroom with a king sized bed and a bed sofa for one. The room has a view to the sea, a large bathroom and a balcony.",
      },
    });
    saveFixture("call-structured", structuredCall);

    // 3. Create a parent span
    console.log("3. Creating parent span...");
    const parentSpan = await opper.spans.create({
      name: "translation_workflow",
      input: {
        article:
          "The rise of artificial intelligence has transformed many industries.",
        languages: ["Swedish", "Danish", "Norwegian"],
      },
    });
    saveFixture("span-create", parentSpan);

    // 4. Call with parent span
    console.log("4. Making call with parent span...");
    const callWithParent = await opper.call({
      name: "translate_text",
      instructions: "Translate the text to the target language",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The text to translate",
          },
          target_language: {
            type: "string",
            description: "The target language",
          },
        },
        required: ["text", "target_language"],
      },
      outputSchema: {
        type: "object",
        properties: {
          original_language: {
            type: "string",
            description: "The original language of the text",
          },
          destination_language: {
            type: "string",
            description: "The target language of translation",
          },
          translated_text: {
            type: "string",
            description: "The translated text",
          },
        },
        required: [
          "original_language",
          "destination_language",
          "translated_text",
        ],
      },
      input: {
        text: "Artificial intelligence has transformed many industries",
        target_language: "Swedish",
      },
      parentSpanId: parentSpan.id,
    });
    saveFixture("call-with-parent-span", callWithParent);

    // 5. Update the span with output (as string)
    console.log("5. Updating span with output...");
    const spanUpdate = await opper.spans.update(parentSpan.id, {
      output: JSON.stringify({
        translations: [
          "Swedish translation",
          "Danish translation",
          "Norwegian translation",
        ],
        status: "completed",
      }),
    });
    saveFixture("span-update", spanUpdate);

    // 6. Call with no usage (cache hit or minimal response)
    console.log("6. Making simple call...");
    const simpleCall = await opper.call({
      name: "simple_greeting",
      instructions: "Say hello",
      input: {},
    });
    saveFixture("call-no-usage", simpleCall);

    console.log("\n✅ All fixtures generated successfully!");
    console.log(`\nFixtures saved to: ${FIXTURES_DIR}`);
  } catch (error) {
    console.error("\n❌ Error generating fixtures:");

    if (error instanceof Error) {
      console.error(`Message: ${error.message}`);

      // Save error responses as fixtures too
      if ((error as any).response) {
        const errorResponse = (error as any).response;

        if (errorResponse.status === 429) {
          console.log("\nSaving rate limit error fixture...");
          saveFixture("error-rate-limit", {
            error: errorResponse.data,
            statusCode: errorResponse.status,
          });
        } else if (errorResponse.status === 400) {
          console.log("\nSaving invalid request error fixture...");
          saveFixture("error-invalid-schema", {
            error: errorResponse.data,
            statusCode: errorResponse.status,
          });
        }
      }
    }

    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
