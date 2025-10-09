/**
 * Fixture loader utility for tests
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load a fixture file from tests/fixtures/opper
 */
export function loadFixture<T = unknown>(name: string): T {
  const fixturePath = join(__dirname, "../fixtures/opper", `${name}.json`);
  const content = readFileSync(fixturePath, "utf-8");
  return JSON.parse(content) as T;
}

/**
 * Get all available fixture names
 */
export function listFixtures(): string[] {
  return [
    "call-basic",
    "call-structured",
    "call-with-parent-span",
    "call-no-usage",
    "span-create",
    "span-update",
  ];
}
