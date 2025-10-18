# MCP Server Implementation Plan for Art App

## Overview

This document defines a lean, deterministic **Model Context Protocol (MCP) server** plan that lets an LLM control the Art App’s parameters, layers, and full state without adding an HTTP bridge inside the React/Vite UI. The guiding principles:
- **Single source of truth** lives in a new shared "core" module that both the React UI and the MCP server import.
- **Minimal tool surface** keeps the LLM effective while reducing maintenance.
- **Strict validation, determinism, and versioning** prevent state drift and make automated testing feasible.

## Recommended Architecture

```
┌─────────────────┐        ┌──────────────┐        ┌────────────────┐
│   LLM Client    │◄──────►│  MCP Server  │◄──────►│   Core Module   │
│ (Claude, MCP)   │  MCP   │ (Node, stdio)│  JS API│ (pure functions)│
└─────────────────┘        └──────────────┘        └────────┬───────┘
                                                          ▲  │
                                                          │  ▼
                                                   ┌──────────────┐
                                                   │ React UI (Vite│
                                                   │  + Canvas)    │
                                                   └──────────────┘
```

- **Shared core module (recommended):** Factor all state management, parameter metadata, randomization, and serialization into pure, Node-compatible logic. Both the React UI and the MCP server import this module, eliminating API duplication and drift.
- **Headless browser bridge (optional Phase 2b):** If rendering or certain mutations require DOM access, isolate them behind a Playwright/Puppeteer helper managed by the MCP server. This component only loads the built app, injects state, captures output, and tears down.
- **Alternative (desktop/Electron):** Embed the MCP server in the main process and communicate with the renderer via IPC. Use this only if distribution shifts to a desktop wrapper.

### Why no HTTP bridge inside the UI?
- **Less security surface:** No ad-hoc Express server means no CORS/auth headaches.
- **Consistent state:** Core functions mutate shared data structures, so UI and MCP agree.
- **Simpler deployment:** MCP server ships as a Node process talking stdio to the client.

## Minimum Viable Tool Surface

Start with an orthogonal set of tools. Expand only if user interactions demand it.

- **`get_schema`** — return parameter and state schemas (types, ranges, enums).
- **`get_state`** — return the latest canonical state plus a `version` integer.
- **`set_state`** — apply partial updates using dot-path keys or structured patches, with optional optimistic concurrency (`expectedVersion`). Server rounds values to valid steps and returns warnings for coercions.
- **`get_layer` / `set_layer` / `add_layer` / `delete_layer`** — CRUD focused solely on layers.
- **`randomize`** — deterministic randomization over scopes (`all`, `layer`, `colors`, `anim`) using seeded RNG.
- **`toggle_freeze`** — freeze/unfreeze animation while honoring deterministic contract.
- **`export_state` / `import_state`** — serialize/restore full configurations, including MIDI mappings as needed.
- **`export_image`** *(optional Phase 2b)* — produce still renders through the headless renderer when enabled via feature flag.

Everything else (groups, palettes, etc.) can be composed from `get_state` + `set_state`. Avoid premature specialization.

## Validation and Error Contracts

- **Zod schemas** (or similar) define every tool’s input/output. Invalid inputs never reach core logic.
- **Numeric coercion:** `set_state`/`set_layer` round to the nearest allowed `step`, clamp within `[min,max]`, and return `{ warnings: [{ path, original, coerced }] }`.
- **Enumerations:** Validate strictly; suggest nearest valid option using Levenshtein distance (`drifft` → hint "drift").
- **Layer identification:** Require exactly one of `layerId` or `layerIndex`; reject both/none.
- **Error shape:** `{ code: string, message: string, details?: object }` across all failures.
- **Schema source:** Use the existing JSON exports (e.g., `nice_random_pattern.json`) to seed the schema definitions and ensure compatibility with saved scenes.

## Determinism, Versioning, and Undo

- **Determinism contract:**
  - When `isFrozen === true`, rendering and state evolution must ignore wall-clock time; seed + state ⇒ identical pixels.
  - Define `layerSeed = hash(globalSeed, layer.id)` and reuse `createSeededRandom` utilities for all randomness.
  - Animations advance using an explicit tick value supplied by the core module, not `Date.now()`.
- **State versioning:** `get_state` returns `{ state, version }`. Mutating tools accept `expectedVersion`; if mismatched, respond with `{ code: 'version_conflict', details: { expected, actual, diff } }`.
- **Undo/redo:** Maintain a bounded history inside the core module. Expose `undo` and `redo` tools once history exists, including metadata (`actor`, `tool`, `args`). Even a depth of 10 greatly aids debugging.

## Implementation Plan

### Phase 1 – Core Module & Schema (4–6 hours)
- **Dir:** `packages/core/` (or `core/` within repo).
- **Deliverables:**
  - **`packages/core/src/schema.ts`** — Zod schemas for parameters, layers, app state.
  - **`packages/core/src/state.ts`** — Immutable state store managing versions, history, undo/redo, optimistic updates.
  - **`packages/core/src/randomization.ts`** — Deterministic RNG utilities seeded from `globalSeed` and layered seeds.
  - **`packages/core/src/serialization.ts`** — `exportState`, `importState`, `toSnapshot`, `fromSnapshot` with compatibility guards.
  - **`packages/core/src/index.ts`** — Public API: `getSchema`, `getState`, `setState`, `getLayer`, `setLayer`, `addLayer`, `deleteLayer`, `randomize`, `toggleFreeze`, `undo`, `redo`.
- **React integration:** Update `src/context/ParameterContext.jsx` and `src/context/AppStateContext.jsx` to call the core module rather than duplicating logic. Maintain existing React state, but populate and persist via `core` functions.

### Phase 2 – MCP Server Skeleton & Tools (5–7 hours)
- **Dir:** `mcp-server/`.
- **Deliverables:**
  - **`mcp-server/src/index.ts`** — Instantiate `Server` with stdio transport.
  - **`mcp-server/src/tools/*.ts`** — Register minimal tools listed above, delegating to `core` and reusing Zod validators from `core`.
  - **`mcp-server/src/errors.ts`** — Helpers to normalize error responses.
  - **`mcp-server/src/logger.ts`** — Structured logging (pino or console).
- **Transport:** Stdio only; document how to configure MCP clients (Claude Desktop, etc.).
- **Resources:** None initially. Tools are the canonical interface. Consider `resources` only if a read-only streaming interface becomes necessary.

### Phase 2b – Optional Headless Renderer (6–8 hours)
- **Dir:** `mcp-server/src/render/`.
- **Deliverables:**
  - **`playwrightRenderer.ts`** — Launch Playwright, load built app, inject state via `window.__ARTAPP_MCP_IMPORT(state)`, freeze, capture PNG/WebP.
  - **Pooling:** Maintain a small browser pool; enforce timeouts and memory caps.
  - **Feature flag:** Guard behind `process.env.EXPORT_IMAGE_ENABLED`. Tool throws informative error if disabled.

### Phase 3 – Validation, Versioning, Undo (4–5 hours)
- Implement optimistic concurrency checks inside `core`. **Status:** ✅ `StateStore` enforces `expectedVersion` in `AppService.setState()` and tool handlers return `{ code: 'version_conflict' }`.
- Wire undo/redo stacks with history metadata. **Status:** ✅ `StateStore` now publishes history entries with timestamps, and MCP tools expose `undo`, `redo`, and `get_history` including structured metadata.
- Enhance error payloads with diff previews (e.g., `fast-json-patch` diffs) on conflicts.
- Add server-side rounding/coercion warnings.

### Phase 4 – Testing & Quality Gates (5–7 hours)
- **Unit tests:**
  - `core` functions (Zod schema guards, randomization, undo/redo). **Status:** ✅ Added `packages/core/__tests__/stateStore.test.ts` to cover history/undo flows.
  - Tool handlers (validation, error codification). **Status:** ✅ Added `mcp-server/src/tools/__tests__/registerTools.test.ts` verifying tool listing, optimistic concurrency, error propagation, and undo error handling.
- **Fuzz tests:** Randomize inputs near min/max/step boundaries for `set_state`, `set_layer`.
- **Determinism test:** Freeze state, render twice (if Phase 2b), assert byte equality.
- **Tool smoke prompts:** Scripted MCP client interactions emulating typical LLM usage to ensure the surface remains coherent.

#### Test Commands
- **Run full suite:** `npm run test`
- **Run targeted core tests:** `npm run test -- packages/core/__tests__/stateStore.test.ts`
- **Run targeted MCP tool tests:** `npm run test:run -- mcp-server/src/tools/__tests__/registerTools.test.ts`

### Phase 5 – Documentation & Adoption (3–4 hours)
- **Docs:**
  - `MCP_USER_GUIDE.md` — setup, cli commands, client configuration.
  - `MCP_TOOL_REFERENCE.md` — per-tool signature, sample request/response, error examples.
  - `MCP_ARCHITECTURE.md` — diagrams, determinism contract, versioning rules.
- **Examples:** Provide natural-language prompts mapped to tool sequences.
- **Changelog:** Track schema changes so existing saves stay compatible.

## Testing Strategy Overview

- **Unit coverage:** 80%+ for core module functions and tool handlers.
- **Snapshot fixtures:** Use existing JSON exports as golden files for import/export regression tests.
- **Determinism harness:** Script that loads a scene, runs `toggle_freeze(true)`, captures two renders (if renderer exists), asserts equality.
- **Regression fuzzing:** Generate random but valid state patches, round-trip through export/import, compare with initial state.

## Security, Concurrency, and Deployment

- **Local-only defaults:** MCP server binds to stdio; no open ports.
- **Auth (if later network transport needed):** Use short-lived bearer tokens stored outside repo.
- **Rate limits:** Apply when enabling renderer or heavy randomization to avoid resource exhaustion.
- **Version conflicts:** Encourage MCP clients to re-fetch state on `version_conflict` errors before retrying.
- **Undo safety:** Undo stack records the tool name and hash of arguments for auditability.

## File Checklist

- **Core package:**
  - `packages/core/package.json`
  - `packages/core/tsconfig.json`
  - `packages/core/src/schema.ts`
  - `packages/core/src/state.ts`
  - `packages/core/src/randomization.ts`
  - `packages/core/src/serialization.ts`
  - `packages/core/src/index.ts`
  - `packages/core/__tests__/*.test.ts`
- **React integration updates:**
  - `src/context/ParameterContext.jsx`
  - `src/context/AppStateContext.jsx`
  - Any hooks (`useRandomization`, etc.) that should consume `core` utilities.
- **MCP server:**
  - `mcp-server/package.json`
  - `mcp-server/tsconfig.json`
  - `mcp-server/src/index.ts`
  - `mcp-server/src/tools/*.ts`
  - `mcp-server/src/errors.ts`
  - `mcp-server/src/logger.ts`
  - `mcp-server/src/render/playwrightRenderer.ts` *(optional)*
  - `mcp-server/.env.example`
  - `mcp-server/README.md`
- **Documentation:**
  - `MCP_USER_GUIDE.md`
  - `MCP_TOOL_REFERENCE.md`
  - `MCP_ARCHITECTURE.md`

## Minimum Viable MCP Walkthrough

1. **Start MCP server:** `npm run dev --workspace mcp-server`.
2. **Connect client:** Configure Claude Desktop to run `node mcp-server/dist/index.js` (stdio transport).
3. **LLM call sequence:**
   - Call `get_schema` to inspect available parameters/layers.
   - Call `get_state` to fetch state `{ version }`.
   - Call `set_state` with payload like `{ updates: { 'parameters.curviness.value': 0.6 }, expectedVersion }`.
   - Receive `{ success: true, version: <next>, warnings: [...] }`.
   - Call `export_state` for persistence or `randomize({ scope: 'layer', layerId })` to explore.

## Example Error Payload

```json
{
  "code": "validation_error",
  "message": "movementStyle must be one of ['bounce','drift','still','orbit']",
  "details": {
    "path": "parameters.movementStyle",
    "received": "drifft",
    "suggestion": "drift"
  }
}
```

## Open Questions

- **Renderer demand:** Is `export_image` required for initial milestone, or can we defer to Phase 2b?
- **History length:** How deep should undo/redo go given memory constraints?
- **State persistence:** Should the core module persist automatically, or leave storage to UI/MCP callers?
- **Multi-client coordination:** If multiple MCP clients connect, do we serialize requests or rely on version conflicts + retries?

## Resources

- [MCP Docs](https://modelcontextprotocol.io/)
- [TypeScript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Sample MCP Servers](https://github.com/modelcontextprotocol/servers)
- [Claude Desktop MCP Guide](https://docs.anthropic.com/claude/docs/mcp)

---

**Document Version:** 1.1  
**Last Updated:** 2025-10-17  
**Maintainer:** Art App Team
