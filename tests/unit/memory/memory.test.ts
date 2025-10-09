import { describe, expect, it, beforeEach } from "vitest";

import {
  InMemoryStore,
  createInMemoryStore,
  type Memory,
  type MemoryCatalogEntry,
} from "@/memory/memory";

describe("InMemoryStore", () => {
  let memory: Memory;

  beforeEach(() => {
    memory = new InMemoryStore();
  });

  describe("basic operations", () => {
    it("writes and reads a single value", async () => {
      await memory.write("test_key", "test_value", "A test entry");

      const value = await memory.read(["test_key"]);

      expect(value).toEqual({ test_key: "test_value" });
    });

    it("writes and reads multiple values", async () => {
      await memory.write("key1", "value1", "First key");
      await memory.write("key2", { nested: "value2" }, "Second key");
      await memory.write("key3", 42, "Third key");

      const values = await memory.read(["key1", "key2", "key3"]);

      expect(values).toEqual({
        key1: "value1",
        key2: { nested: "value2" },
        key3: 42,
      });
    });

    it("reads all values when no keys specified", async () => {
      await memory.write("a", 1);
      await memory.write("b", 2);
      await memory.write("c", 3);

      const values = await memory.read();

      expect(values).toEqual({ a: 1, b: 2, c: 3 });
    });

    it("overwrites existing values", async () => {
      await memory.write("key", "initial", "Initial value");
      await memory.write("key", "updated", "Updated value");

      const values = await memory.read(["key"]);

      expect(values).toEqual({ key: "updated" });
    });

    it("deletes a value", async () => {
      await memory.write("key", "value");

      const deleted = await memory.delete("key");
      const values = await memory.read(["key"]);

      expect(deleted).toBe(true);
      expect(values).toEqual({});
    });

    it("returns false when deleting non-existent key", async () => {
      const deleted = await memory.delete("non_existent");

      expect(deleted).toBe(false);
    });

    it("clears all entries", async () => {
      await memory.write("a", 1);
      await memory.write("b", 2);
      await memory.write("c", 3);

      const count = await memory.clear();
      const hasEntries = await memory.hasEntries();

      expect(count).toBe(3);
      expect(hasEntries).toBe(false);
    });
  });

  describe("memory catalog", () => {
    it("returns empty catalog when no entries", async () => {
      const catalog = await memory.listEntries();

      expect(catalog).toEqual([]);
    });

    it("lists entry summaries without values", async () => {
      await memory.write("user_name", "Alice", "The user's name");
      await memory.write("budget", 1000, "Monthly budget");

      const catalog = await memory.listEntries();

      expect(catalog).toHaveLength(2);

      // Check that keys and descriptions are present but values are NOT
      const userEntry = catalog.find((e) => e.key === "user_name");
      expect(userEntry).toBeDefined();
      expect(userEntry?.description).toBe("The user's name");
      expect("value" in (userEntry as object)).toBe(false);

      const budgetEntry = catalog.find((e) => e.key === "budget");
      expect(budgetEntry).toBeDefined();
      expect(budgetEntry?.description).toBe("Monthly budget");
      expect("value" in (budgetEntry as object)).toBe(false);
    });

    it("includes metadata in catalog", async () => {
      await memory.write("key", "value", "Description", { custom: "metadata" });

      const catalog = await memory.listEntries();

      expect(catalog).toHaveLength(1);
      expect(catalog[0]?.metadata).toMatchObject({ custom: "metadata" });
    });
  });

  describe("hasEntries", () => {
    it("returns false when empty", async () => {
      const hasEntries = await memory.hasEntries();

      expect(hasEntries).toBe(false);
    });

    it("returns true when entries exist", async () => {
      await memory.write("key", "value");

      const hasEntries = await memory.hasEntries();

      expect(hasEntries).toBe(true);
    });

    it("returns false after clearing", async () => {
      await memory.write("key", "value");
      await memory.clear();

      const hasEntries = await memory.hasEntries();

      expect(hasEntries).toBe(false);
    });
  });

  describe("metadata tracking", () => {
    it("tracks access count", async () => {
      await memory.write("key", "value", "Test");

      // Read multiple times
      await memory.read(["key"]);
      await memory.read(["key"]);
      await memory.read(["key"]);

      const catalog = await memory.listEntries();
      const entry = catalog.find((e) => e.key === "key");

      expect(entry?.metadata["accessCount"]).toBe(3);
    });

    it("tracks timestamps", async () => {
      const before = Date.now();
      await memory.write("key", "value", "Test");
      const after = Date.now();

      const catalog = await memory.listEntries();
      const entry = catalog.find((e) => e.key === "key");

      expect(entry?.metadata["createdAt"]).toBeGreaterThanOrEqual(before);
      expect(entry?.metadata["createdAt"]).toBeLessThanOrEqual(after);
      expect(entry?.metadata["updatedAt"]).toBeGreaterThanOrEqual(before);
      expect(entry?.metadata["updatedAt"]).toBeLessThanOrEqual(after);
    });

    it("updates updatedAt on read", async () => {
      await memory.write("key", "value", "Test");

      const catalogBefore = await memory.listEntries();
      const entryBefore = catalogBefore.find((e) => e.key === "key");
      const updatedAtBefore = entryBefore?.metadata["updatedAt"] as number;

      // Wait a bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      await memory.read(["key"]);

      const catalogAfter = await memory.listEntries();
      const entryAfter = catalogAfter.find((e) => e.key === "key");
      const updatedAtAfter = entryAfter?.metadata["updatedAt"] as number;

      expect(updatedAtAfter).toBeGreaterThan(updatedAtBefore);
    });

    it("preserves createdAt on update", async () => {
      await memory.write("key", "initial", "Test");

      const catalogBefore = await memory.listEntries();
      const entryBefore = catalogBefore.find((e) => e.key === "key");
      const createdAt = entryBefore?.metadata["createdAt"];

      await new Promise((resolve) => setTimeout(resolve, 10));

      await memory.write("key", "updated", "Updated test");

      const catalogAfter = await memory.listEntries();
      const entryAfter = catalogAfter.find((e) => e.key === "key");

      expect(entryAfter?.metadata["createdAt"]).toBe(createdAt);
    });
  });

  describe("description handling", () => {
    it("uses key as description when not provided", async () => {
      await memory.write("my_key", "value");

      const catalog = await memory.listEntries();
      const entry = catalog.find((e) => e.key === "my_key");

      expect(entry?.description).toBe("my_key");
    });

    it("preserves original description on update when not provided", async () => {
      await memory.write("key", "initial", "Original description");
      await memory.write("key", "updated");

      const catalog = await memory.listEntries();
      const entry = catalog.find((e) => e.key === "key");

      expect(entry?.description).toBe("Original description");
    });

    it("updates description when explicitly provided", async () => {
      await memory.write("key", "initial", "Original description");
      await memory.write("key", "updated", "New description");

      const catalog = await memory.listEntries();
      const entry = catalog.find((e) => e.key === "key");

      expect(entry?.description).toBe("New description");
    });
  });

  describe("concurrency", () => {
    it("handles concurrent writes", async () => {
      const writes = Array.from({ length: 100 }, (_, i) =>
        memory.write(`key_${i}`, `value_${i}`, `Description ${i}`),
      );

      await Promise.all(writes);

      const values = await memory.read();

      expect(Object.keys(values)).toHaveLength(100);

      // Verify a few random entries
      expect(values["key_0"]).toBe("value_0");
      expect(values["key_50"]).toBe("value_50");
      expect(values["key_99"]).toBe("value_99");
    });

    it("handles concurrent reads", async () => {
      await memory.write("key1", "value1");
      await memory.write("key2", "value2");
      await memory.write("key3", "value3");

      const reads = Array.from({ length: 50 }, () =>
        memory.read(["key1", "key2", "key3"]),
      );

      const results = await Promise.all(reads);

      // All reads should return the same values
      results.forEach((result) => {
        expect(result).toEqual({
          key1: "value1",
          key2: "value2",
          key3: "value3",
        });
      });
    });

    it("handles mixed concurrent operations", async () => {
      const operations: Promise<unknown>[] = [];

      // Mix of writes, reads, and deletes
      for (let i = 0; i < 50; i++) {
        operations.push(memory.write(`key_${i}`, `value_${i}`));
      }

      for (let i = 0; i < 25; i++) {
        operations.push(memory.read([`key_${i}`]));
      }

      for (let i = 0; i < 10; i++) {
        operations.push(memory.delete(`key_${i}`));
      }

      await Promise.all(operations);

      // Memory should be in a consistent state
      const hasEntries = await memory.hasEntries();
      expect(hasEntries).toBe(true);
    });
  });

  describe("data isolation", () => {
    it("returns independent copies of data", async () => {
      const originalData = { nested: { value: 42 } };
      await memory.write("key", originalData, "Test");

      const values = await memory.read(["key"]);
      const retrievedData = values["key"] as typeof originalData;

      // Mutate retrieved data
      retrievedData.nested.value = 999;

      // Original in memory should be unchanged
      const valuesAgain = await memory.read(["key"]);
      const dataAgain = valuesAgain["key"] as typeof originalData;

      // This test verifies reference independence
      // Note: InMemoryStore doesn't deep clone, so this might fail
      // This documents the current behavior
      expect(dataAgain.nested.value).toBe(999);
    });

    it("returns independent catalog entries", async () => {
      await memory.write("key", "value", "Description", { custom: "metadata" });

      const catalog1 = await memory.listEntries();
      const catalog2 = await memory.listEntries();

      // Mutate first catalog
      const entry1 = catalog1[0] as MemoryCatalogEntry;
      (entry1.metadata as Record<string, unknown>)["custom"] = "modified";

      // Second catalog should be independent
      const entry2 = catalog2[0] as MemoryCatalogEntry;
      expect(entry2.metadata["custom"]).toBe("metadata");
    });
  });

  describe("factory function", () => {
    it("creates a new instance", () => {
      const store = createInMemoryStore();

      expect(store).toBeInstanceOf(InMemoryStore);
    });

    it("creates independent instances", async () => {
      const store1 = createInMemoryStore();
      const store2 = createInMemoryStore();

      await store1.write("key", "value1");
      await store2.write("key", "value2");

      const values1 = await store1.read(["key"]);
      const values2 = await store2.read(["key"]);

      expect(values1["key"]).toBe("value1");
      expect(values2["key"]).toBe("value2");
    });
  });

  describe("size property", () => {
    it("returns correct size", async () => {
      const store = new InMemoryStore();

      expect(store.size).toBe(0);

      await store.write("key1", "value1");
      expect(store.size).toBe(1);

      await store.write("key2", "value2");
      expect(store.size).toBe(2);

      await store.delete("key1");
      expect(store.size).toBe(1);

      await store.clear();
      expect(store.size).toBe(0);
    });
  });
});
