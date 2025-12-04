#!/usr/bin/env tsx
/**
 * Run all examples in a specific folder
 *
 * Usage:
 *   pnpm run-examples 01_getting_started
 *   pnpm run-examples applied_agents
 *   pnpm run-examples  # runs all folders
 */

import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const EXAMPLES_DIR = "examples";

interface ExampleResult {
  file: string;
  success: boolean;
  duration: number;
  error?: string;
}

async function getExampleFolders(): Promise<string[]> {
  const entries = await readdir(EXAMPLES_DIR);
  const folders: string[] = [];

  for (const entry of entries) {
    const fullPath = join(EXAMPLES_DIR, entry);
    const stats = await stat(fullPath);
    if (stats.isDirectory()) {
      folders.push(entry);
    }
  }

  return folders.sort();
}

async function getExampleFiles(folder: string): Promise<string[]> {
  const folderPath = join(EXAMPLES_DIR, folder);
  const entries = await readdir(folderPath);

  return entries
    .filter((f) => f.endsWith(".ts"))
    .sort()
    .map((f) => join(folderPath, f));
}

async function runExample(filePath: string): Promise<ExampleResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const proc = spawn("pnpm", ["example", filePath], {
      stdio: ["inherit", "inherit", "inherit"],
      shell: true,
    });

    proc.on("close", (code) => {
      const duration = Date.now() - startTime;
      resolve({
        file: filePath,
        success: code === 0,
        duration,
        ...(code !== 0 && { error: `Exit code: ${code}` }),
      });
    });

    proc.on("error", (err) => {
      const duration = Date.now() - startTime;
      resolve({
        file: filePath,
        success: false,
        duration,
        error: err.message,
      });
    });
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function printSummary(results: ExampleResult[]): void {
  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70) + "\n");

  const passed = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  if (passed.length > 0) {
    console.log(`✅ Passed (${passed.length}):`);
    for (const r of passed) {
      console.log(`   ${r.file} (${formatDuration(r.duration)})`);
    }
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed (${failed.length}):`);
    for (const r of failed) {
      console.log(`   ${r.file} (${formatDuration(r.duration)})`);
      if (r.error) {
        console.log(`      Error: ${r.error}`);
      }
    }
  }

  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  console.log(
    `\nTotal: ${passed.length}/${results.length} passed in ${formatDuration(totalDuration)}`,
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const folderArg = args[0];

  // Check for API key
  if (!process.env["OPPER_API_KEY"]) {
    console.error("❌ Error: OPPER_API_KEY environment variable not set");
    process.exit(1);
  }

  let foldersToRun: string[];

  if (folderArg) {
    // Check if folder exists
    try {
      await stat(join(EXAMPLES_DIR, folderArg));
      foldersToRun = [folderArg];
    } catch {
      console.error(`❌ Error: Folder "${folderArg}" not found in ${EXAMPLES_DIR}/`);
      console.error("\nAvailable folders:");
      const available = await getExampleFolders();
      for (const f of available) {
        console.error(`  - ${f}`);
      }
      process.exit(1);
    }
  } else {
    foldersToRun = await getExampleFolders();
  }

  console.log("🚀 Running examples...\n");

  const allResults: ExampleResult[] = [];

  for (const folder of foldersToRun) {
    console.log("=".repeat(70));
    console.log(`📁 ${folder}`);
    console.log("=".repeat(70) + "\n");

    const files = await getExampleFiles(folder);

    for (const file of files) {
      console.log(`\n▶ Running: ${file}\n`);
      console.log("-".repeat(50));

      const result = await runExample(file);
      allResults.push(result);

      console.log("-".repeat(50));
      if (result.success) {
        console.log(`✅ Completed in ${formatDuration(result.duration)}\n`);
      } else {
        console.log(`❌ Failed in ${formatDuration(result.duration)}\n`);
      }
    }
  }

  printSummary(allResults);

  // Exit with error code if any failed
  const hasFailures = allResults.some((r) => !r.success);
  process.exit(hasFailures ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
