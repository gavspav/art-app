# Art App MCP Server

Model Context Protocol (MCP) server for the Art App, providing programmatic control over parameters, layers, and state.

## Quick Start

### Build
```bash
npm run build --workspace mcp-server
```

### Development
```bash
npm run dev --workspace mcp-server
```

### Testing
```bash
npm run test:run -- mcp-server/src/tools/__tests__/registerTools.test.ts
```

## Documentation
- **[MCP_USER_GUIDE.md](../MCP_USER_GUIDE.md)** — Setup and usage instructions
- **[MCP_TOOL_REFERENCE.md](../MCP_TOOL_REFERENCE.md)** — Tool signatures and examples
- **[MCP_ARCHITECTURE.md](../MCP_ARCHITECTURE.md)** — Architecture overview

## Available Tools
- `get_schema`, `get_state`, `set_state`
- Layer CRUD: `get_layer`, `set_layer`, `add_layer`, `delete_layer`
- `randomize`, `toggle_freeze`
- History: `undo`, `redo`, `get_history`
- Snapshot IO: `export_state`, `import_state`

## Configuration
The server uses stdio transport by default. Configure MCP clients to execute:
```bash
node mcp-server/dist/index.js
```

## Dependencies
- `@art-app/core` — Shared state management and schemas
- `@modelcontextprotocol/sdk` — MCP protocol implementation
- `zod` — Runtime validation

## License
Private
