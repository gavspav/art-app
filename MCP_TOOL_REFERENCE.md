# MCP Tool Reference

## Overview
MCP tools operate over stdio using JSON-RPC-style messages. Each call returns a list of `content` items; the primary response payload is emitted as JSON text. All errors follow `{ code: string, message: string, details?: object }`.

## Tool Index
- `get_schema`
- `get_state`
- `set_state`
- `get_layer`
- `set_layer`
- `add_layer`
- `delete_layer`
- `randomize`
- `toggle_freeze`
- `export_state`
- `import_state`
- `undo`
- `redo`
- `get_history`

## Tool Details

### `get_schema`
- **Description:** Returns parameter metadata and the default app state template.
- **Input:** `{}`
- **Output:**
  ```json
  {
    "parameters": [...],
    "appState": {...}
  }
  ```
- **Notes:** Useful for bootstrapping clients that need parameter ranges and defaults.

### `get_state`
- **Description:** Provides the current canonical state and version.
- **Input:** `{}`
- **Output:**
  ```json
  {
    "version": number,
    "state": {...}
  }
  ```
- **Notes:** Always call before mutating to obtain `expectedVersion`.

### `set_state`
- **Description:** Replaces the entire application state.
- **Input:**
  ```json
  {
    "expectedVersion"?: number,
    "state": {...}
  }
  ```
- **Output:**
  ```json
  {
    "version": number
  }
  ```
- **Errors:**
  - `version_conflict` when `expectedVersion` mismatches; `details` includes `{ expected, actual }`.

### `get_layer`
- **Description:** Retrieves a single layer by `layerId` or `layerIndex`.
- **Input:**
  ```json
  {
    "layerId"?: string,
    "layerIndex"?: number
  }
  ```
- **Output:**
  ```json
  {
    "version": number,
    "layer": {...},
    "index": number
  }
  ```
- **Errors:**
  - `not_found` if the layer cannot be resolved.
  - `invalid_request` when both/none of identifiers are supplied.

### `set_layer`
- **Description:** Applies updates to a specific layer.
- **Input:**
  ```json
  {
    "layerId"?: string,
    "layerIndex"?: number,
    "layer": {...},
    "expectedVersion"?: number
  }
  ```
- **Output:**
  ```json
  {
    "version": number,
    "layer": {...}
  }
  ```
- **Notes:** Merges provided fields, normalizes via core schema, and reassigns IDs as needed.

### `add_layer`
- **Description:** Inserts a new normalized layer at an optional position.
- **Input:**
  ```json
  {
    "layer"?: {...},
    "position"?: number,
    "expectedVersion"?: number
  }
  ```
- **Output:**
  ```json
  {
    "version": number,
    "layers": [...]
  }
  ```

### `delete_layer`
- **Description:** Removes a layer by identifier.
- **Input:**
  ```json
  {
    "layerId"?: string,
    "layerIndex"?: number,
    "expectedVersion"?: number
  }
  ```
- **Output:**
  ```json
  {
    "version": number,
    "removedIndex": number
  }
  ```

### `randomize`
- **Description:** Generates new seeds for the whole scene, a layer, or palette.
- **Input:**
  ```json
  {
    "scope"?: "all" | "layer" | "colors",
    "layerId"?: string,
    "expectedVersion"?: number
  }
  ```
- **Output:** `{ "version": number }`
- **Errors:** `invalid_request` if `scope === "layer"` without `layerId`.

### `toggle_freeze`
- **Description:** Toggles or explicitly sets the `isFrozen` flag.
- **Input:**
  ```json
  {
    "value"?: boolean,
    "expectedVersion"?: number
  }
  ```
- **Output:**
  ```json
  {
    "version": number,
    "isFrozen": boolean
  }
  ```

### `export_state`
- **Description:** Emits a snapshot suitable for persistence.
- **Input:** `{}`
- **Output:**
  ```json
  {
    "version": number,
    "snapshot": {...}
  }
  ```

### `import_state`
- **Description:** Imports a snapshot and replaces current state.
- **Input:**
  ```json
  {
    "snapshot": {...},
    "expectedVersion"?: number
  }
  ```
- **Output:** `{ "version": number }`

### `undo`
- **Description:** Reverts to the previous state if history exists.
- **Input:** `{ "expectedVersion"?: number }`
- **Output:**
  ```json
  {
    "version": number,
    "state": {...}
  }
  ```
- **Errors:** `nothing_to_undo` when history is empty.

### `redo`
- **Description:** Re-applies an undone change.
- **Input:** `{ "expectedVersion"?: number }`
- **Output:**
  ```json
  {
    "version": number,
    "state": {...}
  }
  ```
- **Errors:** `nothing_to_redo` when redo stack is empty.

### `get_history`
- **Description:** Returns undo/redo stacks with metadata.
- **Input:**
  ```json
  {
    "includeUndo"?: boolean,
    "includeRedo"?: boolean
  }
  ```
- **Output:**
  ```json
  {
    "version": number,
    "history": {
      "undo": [...],
      "redo": [...]
    }
  }
  ```
- **Notes:** Metadata entries include `timestamp`, `tool`, `note`, and `argsHash` when available.

## Error Codes
- `version_conflict`
- `not_found`
- `invalid_request`
- `nothing_to_undo`
- `nothing_to_redo`
- `unknown_tool`
- `internal_error` (fallback for unexpected failures)

Clients should display `message` and inspect `details` for remediation hints.
