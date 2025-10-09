import { z } from "zod";

/**
 * Schema for memory entry metadata
 */
export const MemoryEntryMetadataSchema = z.object({
  createdAt: z.number(),
  updatedAt: z.number(),
  accessCount: z.number().default(0),
});

export type MemoryEntryMetadata = z.infer<typeof MemoryEntryMetadataSchema>;

/**
 * Schema for a single memory entry
 */
export const MemoryEntrySchema = z.object({
  key: z.string(),
  description: z.string(),
  value: z.unknown(),
  metadata: MemoryEntryMetadataSchema,
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

/**
 * Catalog entry (summary without value) for LLM consumption
 */
export interface MemoryCatalogEntry {
  key: string;
  description: string;
  metadata: Record<string, unknown>;
}

/**
 * Memory interface for persistent key-value storage across agent invocations.
 * Implementations must be thread-safe and handle concurrent operations gracefully.
 */
export interface Memory {
  /**
   * Check if memory has any entries
   *
   * @returns True if memory contains entries
   */
  hasEntries(): Promise<boolean>;

  /**
   * List memory catalog (summaries without values) so LLM can decide what to load
   *
   * @returns Array of catalog entries with key, description, metadata (no values)
   */
  listEntries(): Promise<MemoryCatalogEntry[]>;

  /**
   * Read values from memory by keys
   *
   * @param keys - Optional array of keys to read (if omitted, reads all)
   * @returns Object mapping keys to their values
   */
  read(keys?: string[]): Promise<Record<string, unknown>>;

  /**
   * Write a value to memory with the specified key and description
   *
   * @param key - Memory key
   * @param value - Value to store
   * @param description - Human-readable description of what this memory contains
   * @param metadata - Optional metadata
   * @returns The created or updated memory entry
   */
  write(
    key: string,
    value: unknown,
    description?: string,
    metadata?: Record<string, unknown>,
  ): Promise<MemoryEntry>;

  /**
   * Delete a memory entry by key
   *
   * @param key - Memory key to delete
   * @returns True if entry was deleted, false if not found
   */
  delete(key: string): Promise<boolean>;

  /**
   * Clear all memory entries
   *
   * @returns Number of entries cleared
   */
  clear(): Promise<number>;
}

/**
 * Default in-memory implementation of Memory interface.
 * Stores data in a Map that persists across agent invocations within the same process.
 */
export class InMemoryStore implements Memory {
  private readonly store = new Map<string, MemoryEntry>();

  /**
   * Check if memory has any entries
   */
  async hasEntries(): Promise<boolean> {
    return this.store.size > 0;
  }

  /**
   * List memory catalog (summaries without values) for LLM consumption
   */
  async listEntries(): Promise<MemoryCatalogEntry[]> {
    const catalog: MemoryCatalogEntry[] = [];

    for (const entry of this.store.values()) {
      catalog.push({
        key: entry.key,
        description: entry.description,
        metadata: { ...entry.metadata },
      });
    }

    return catalog;
  }

  /**
   * Read values from memory by keys
   */
  async read(keys?: string[]): Promise<Record<string, unknown>> {
    const keysToRead = keys ?? Array.from(this.store.keys());
    const snapshot: Record<string, unknown> = {};

    for (const key of keysToRead) {
      const entry = this.store.get(key);

      if (entry) {
        // Update access tracking
        entry.metadata.accessCount += 1;
        entry.metadata.updatedAt = Date.now();

        snapshot[key] = entry.value;
      }
    }

    return snapshot;
  }

  /**
   * Write a value to memory with description
   */
  async write(
    key: string,
    value: unknown,
    description?: string,
    metadata?: Record<string, unknown>,
  ): Promise<MemoryEntry> {
    const now = Date.now();
    const existing = this.store.get(key);

    const entry: MemoryEntry = {
      key,
      description: description ?? existing?.description ?? key,
      value,
      metadata: existing
        ? {
            createdAt: existing.metadata.createdAt,
            updatedAt: now,
            accessCount: existing.metadata.accessCount,
            ...(metadata ?? {}),
          }
        : {
            createdAt: now,
            updatedAt: now,
            accessCount: 0,
            ...(metadata ?? {}),
          },
    };

    this.store.set(key, entry);

    // Return a copy
    return { ...entry, metadata: { ...entry.metadata } };
  }

  /**
   * Delete a memory entry by key
   */
  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  /**
   * Clear all memory entries
   */
  async clear(): Promise<number> {
    const count = this.store.size;
    this.store.clear();
    return count;
  }

  /**
   * Get the current size of the memory store
   *
   * @returns Number of entries in memory
   */
  get size(): number {
    return this.store.size;
  }
}

/**
 * Factory function to create a new in-memory store
 *
 * @returns New InMemoryStore instance
 */
export const createInMemoryStore = (): InMemoryStore => new InMemoryStore();
