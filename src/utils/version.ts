/**
 * SDK version information
 *
 * This file provides version metadata that is included in the User-Agent header
 * for all Opper API requests made by this SDK.
 */

import packageJson from "../../package.json";

/**
 * The SDK package name
 */
export const SDK_NAME = "@opperai/agents";

/**
 * The current SDK version from package.json
 */
export const SDK_VERSION = packageJson.version;

/**
 * The platform identifier (ts for TypeScript)
 */
export const SDK_PLATFORM = "ts";

/**
 * Returns the formatted User-Agent string for this SDK
 *
 * Format: @opperai/agents-ts/0.1.0
 */
export function getUserAgent(): string {
  return `${SDK_NAME}-${SDK_PLATFORM}/${SDK_VERSION}`;
}
