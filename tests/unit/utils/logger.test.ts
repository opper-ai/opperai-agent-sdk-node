import { describe, expect, it, vi } from "vitest";

import {
  ConsoleLogger,
  getDefaultLogger,
  LogLevel,
  setDefaultLogger,
  SilentLogger,
} from "@/utils/logger";

describe("Logger", () => {
  describe("ConsoleLogger", () => {
    it("creates logger with default INFO level", () => {
      const logger = new ConsoleLogger();
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });

    it("creates logger with custom level", () => {
      const logger = new ConsoleLogger(LogLevel.DEBUG);
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it("allows setting log level", () => {
      const logger = new ConsoleLogger(LogLevel.INFO);
      expect(logger.getLevel()).toBe(LogLevel.INFO);

      logger.setLevel(LogLevel.ERROR);
      expect(logger.getLevel()).toBe(LogLevel.ERROR);
    });

    it("logs debug messages when level is DEBUG", () => {
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      const logger = new ConsoleLogger(LogLevel.DEBUG);

      logger.debug("test message", { key: "value" });

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("[DEBUG] test message"),
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('"key":"value"'),
      );
      stdoutSpy.mockRestore();
    });

    it("does not log debug messages when level is INFO", () => {
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      const logger = new ConsoleLogger(LogLevel.INFO);

      logger.debug("test message");

      expect(stdoutSpy).not.toHaveBeenCalled();
      stdoutSpy.mockRestore();
    });

    it("logs info messages when level is INFO", () => {
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      const logger = new ConsoleLogger(LogLevel.INFO);

      logger.info("test message", { key: "value" });

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("[INFO] test message"),
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('"key":"value"'),
      );
      stdoutSpy.mockRestore();
    });

    it("does not log info messages when level is WARN", () => {
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      const logger = new ConsoleLogger(LogLevel.WARN);

      logger.info("test message");

      expect(stdoutSpy).not.toHaveBeenCalled();
      stdoutSpy.mockRestore();
    });

    it("logs warn messages when level is WARN", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logger = new ConsoleLogger(LogLevel.WARN);

      logger.warn("test message", { key: "value" });

      expect(consoleSpy).toHaveBeenCalledWith("[WARN] test message", {
        key: "value",
      });
      consoleSpy.mockRestore();
    });

    it("does not log warn messages when level is ERROR", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logger = new ConsoleLogger(LogLevel.ERROR);

      logger.warn("test message");

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("logs error messages with Error object", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const logger = new ConsoleLogger(LogLevel.ERROR);
      const error = new Error("test error");

      logger.error("test message", error, { key: "value" });

      expect(consoleSpy).toHaveBeenCalledWith("[ERROR] test message", error, {
        key: "value",
      });
      consoleSpy.mockRestore();
    });

    it("logs error messages without Error object", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const logger = new ConsoleLogger(LogLevel.ERROR);

      logger.error("test message", undefined, { key: "value" });

      expect(consoleSpy).toHaveBeenCalledWith("[ERROR] test message", {
        key: "value",
      });
      consoleSpy.mockRestore();
    });

    it("does not log error messages when level is SILENT", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const logger = new ConsoleLogger(LogLevel.SILENT);

      logger.error("test message");

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("handles messages without metadata", () => {
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      const logger = new ConsoleLogger(LogLevel.INFO);

      logger.info("test message");

      expect(stdoutSpy).toHaveBeenCalledWith("[INFO] test message\n");
      stdoutSpy.mockRestore();
    });
  });

  describe("SilentLogger", () => {
    it("returns SILENT log level", () => {
      const logger = new SilentLogger();
      expect(logger.getLevel()).toBe(LogLevel.SILENT);
    });

    it("does not log debug messages", () => {
      const consoleSpy = vi
        .spyOn(console, "debug")
        .mockImplementation(() => {});
      const logger = new SilentLogger();

      logger.debug("test");

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("does not log info messages", () => {
      const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const logger = new SilentLogger();

      logger.info("test");

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("does not log warn messages", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logger = new SilentLogger();

      logger.warn("test");

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("does not log error messages", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const logger = new SilentLogger();

      logger.error("test");

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("setLevel is a no-op", () => {
      const logger = new SilentLogger();
      logger.setLevel(LogLevel.DEBUG);
      expect(logger.getLevel()).toBe(LogLevel.SILENT);
    });
  });

  describe("Default logger", () => {
    it("returns default logger", () => {
      const logger = getDefaultLogger();
      expect(logger).toBeInstanceOf(ConsoleLogger);
    });

    it("allows setting custom default logger", () => {
      const customLogger = new SilentLogger();
      setDefaultLogger(customLogger);

      const logger = getDefaultLogger();
      expect(logger).toBe(customLogger);

      // Restore default
      setDefaultLogger(new ConsoleLogger(LogLevel.WARN));
    });
  });

  describe("LogLevel enum", () => {
    it("has correct numeric values for ordering", () => {
      expect(LogLevel.DEBUG).toBeLessThan(LogLevel.INFO);
      expect(LogLevel.INFO).toBeLessThan(LogLevel.WARN);
      expect(LogLevel.WARN).toBeLessThan(LogLevel.ERROR);
      expect(LogLevel.ERROR).toBeLessThan(LogLevel.SILENT);
    });
  });
});
