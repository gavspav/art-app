# MCP Server User Guide

## Prerequisites
- Node.js 20+
- npm workspace checkout (root `package.json` manages app + MCP server)

## Installation
```bash
npm install
```
This bootstraps all workspaces, including `mcp-server/`.

## Building
```bash
npm run build --workspace mcp-server
```
Outputs artifacts to `mcp-server/dist/`.

## Development Server
```bash
npm run dev --workspace mcp-server
```
Runs the MCP server in watch mode with stdio transport.

## Testing
- Full suite: `npm run test`
- MCP tools only: `npm run test:run -- mcp-server/src/tools/__tests__/registerTools.test.ts`

## Connecting Clients
Configure MCP-aware clients (e.g., Claude Desktop) to execute:
```bash
node mcp-server/dist/index.js
```
Communication occurs over stdio.

## Available Tools
Refer to `MCP_TOOL_REFERENCE.md` for signatures. Highlights:
- `get_schema`, `get_state`, `set_state`
- Layer CRUD: `get_layer`, `set_layer`, `add_layer`, `delete_layer`
- Randomization & freeze: `randomize`, `toggle_freeze`
- History: `undo`, `redo`, `get_history`
- Snapshot IO: `export_state`, `import_state`

## Error Handling
All tool failures return `{ code, message, details? }`. Handle `version_conflict` by re-fetching state and retrying.

## Logging
Console output is prefixed with `[MCP]` or `[MCP ERROR]` via `mcp-server/src/logger.ts`.

## Troubleshooting
- Watch mode stuck on "Waiting for file changes": press `q`/`Ctrl+C`, or run `npm run test:run` for single pass.
- Version conflicts: ensure `expectedVersion` matches latest `get_state().version`.
