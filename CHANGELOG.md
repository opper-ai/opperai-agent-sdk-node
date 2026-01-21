# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-01-26

### Added

- `run()` method that returns `{ result, usage }` for usage statistics tracking
- `outputSchema` and `examples` support in tool definitions
- Nested agent usage aggregation via `asTool()` - parent agents now include usage from child agents

### Fixed

- Expose MCP tool parameters in think context

## [0.3.0] - 2025-01-21

### Added

- Improved think span names with tool and memory types
- Span timing and hierarchy tracking for tools

### Changed

- Removed separate `final_response` step - result now returned directly from the last think step, saving one LLM call per agent run
- User message now added to the agent loop for better context

## [0.2.0] - 2025-10-21

### Added

- Streaming support for agent responses

## [0.1.3] - 2025-10-17

### Added

- Mermaid diagram support for agent visualization
- NPM token authentication for releases

### Changed

- Updated trusted publisher configuration

## [0.1.1] - 2025-10-14

### Added

- User agent header for API requests
- Response formatting improvements

## [0.1.0] - 2025-10-13

### Added

- Initial release of the Opper Agent TypeScript SDK
- Core `Agent` class for building AI agents
- Tool system with TypeScript decorators
- Memory management for agent context
- MCP (Model Context Protocol) integration
- CommonJS and ESM module support
- Full TypeScript type definitions

[Unreleased]: https://github.com/opper-ai/opperai-agent-sdk-node/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/opper-ai/opperai-agent-sdk-node/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/opper-ai/opperai-agent-sdk-node/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/opper-ai/opperai-agent-sdk-node/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/opper-ai/opperai-agent-sdk-node/compare/v0.1.1...v0.1.3
[0.1.1]: https://github.com/opper-ai/opperai-agent-sdk-node/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/opper-ai/opperai-agent-sdk-node/releases/tag/v0.1.0
