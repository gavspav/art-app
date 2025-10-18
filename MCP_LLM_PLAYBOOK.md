# MCP LLM Playbook

## Purpose
This guide teaches an LLM how to operate the Art App via the MCP server. It explains the creative capabilities, key controls, and natural-language patterns that translate into tool calls.

## 1. App Capabilities Overview
- **Generative artwork** built from layered polygons and textures.
- **Randomization** driven by deterministic seeds (`globalSeed`, per-layer seeds).
- **Animation control** through `isFrozen` and layer motion parameters.
- **Color management** with palettes, gradients, and per-layer color arrays.
- **State persistence** via snapshot export/import.

## 2. Core Concepts & Controls
- **App State (`get_state`)**
  - Contains global parameters (e.g., `globalSeed`, `isFrozen`) and an array of `layers`.
  - Maintain the returned `version` for optimistic concurrency.
- **Parameters**
  - Described by `get_schema().parameters`. Each parameter has type, min/max, and `isRandomizable` flags.
  - Example: `parameters.curviness.value` controls polygon edge curvature.
- **Layers**
  - Each layer has `id`, `name`, `layerType` (`shape` or `image`), `colors`, `position`, `vary`, etc.
  - Use `get_layer`, `set_layer`, `add_layer`, `delete_layer` for targeted edits.
- **Seeds & Randomization**
  - `randomize({ scope: 'all' })` refreshes `globalSeed`.
  - `randomize({ scope: 'layer', layerId })` changes a single layer seed.
  - Use deterministic seeds to produce repeatable results.
- **History**
  - `undo` and `redo` support limited history depth with metadata.
  - `get_history` reveals stack entries, including the tool and notes.

## 3. Typical Workflows
### 3.1 Inspecting State and Schema
1. Call `get_schema` to learn available parameters and defaults.
2. Call `get_state` to obtain the current state and `version`.

### 3.2 Modifying a Parameter
1. Fetch current state (`get_state`).
2. Construct new state with desired change (ensure values remain within allowed range).
3. Call `set_state` with the updated state and `expectedVersion`.

```json
{
  "method": "tools/call",
  "params": {
    "name": "set_state",
    "arguments": {
      "expectedVersion": 3,
      "state": { "globalSeed": "warm-sunset-42" }
    }
  }
}
```

### 3.3 Editing a Single Layer
1. Identify target layer with `get_layer` (by `layerId` returned from state).
2. Update the layer using `set_layer` with partial changes.

```json
{
  "method": "tools/call",
  "params": {
    "name": "set_layer",
    "arguments": {
      "layerId": "layer-abc123",
      "expectedVersion": 4,
      "layer": {
        "colors": ["#FFB347", "#FF6961", "#FFD1DC"]
      }
    }
  }
}
```

### 3.4 Creating New Artwork Quickly
1. `randomize({ scope: 'all' })` to get fresh seeds.
2. Optionally randomize palette via `randomize({ scope: 'colors' })`.
3. Adjust global parameters like `curviness`, `numSides`, `palette` using `set_state`.
4. Add or adjust layers for structure and texture.

### 3.5 Undo/Redo Safety
- After a complex sequence, call `undo` if the result is undesirable.
- `redo` can restore the last undone state.

## 4. Mapping Natural Language to Tool Calls
### Example 1: “Give me a vibrant sunset composition with smooth curves.”
1. `randomize({ scope: 'all' })` to reset seeds.
2. `set_state` to adjust global palette or warm color presets.
3. For `smooth curves`, increase `parameters.curviness.value`.
4. Optionally adjust layer colors via `set_layer`.

### Example 2: “Freeze the animation, then brighten the foreground layer.”
1. `toggle_freeze({ value: true, expectedVersion })`.
2. `get_layer` for the foreground layer.
3. `set_layer` to raise brightness (modify color array or opacity).

### Example 3: “Reload the last saved snapshot.”
1. Load snapshot JSON (provided externally).
2. Call `import_state({ snapshot, expectedVersion })`.
3. Verify by calling `get_state`.

## 5. Best Practices
- **Always use latest `version`**: after each mutation, read the returned `version` and reuse it for the next `expectedVersion`.
- **Minimal diffs**: prefer `set_layer` over `set_state` for localized updates.
- **Validate assumptions**: revisit `get_schema` if unsure about parameter ranges or enumerations.
- **Handle errors gracefully**:
  - On `version_conflict`, refetch state and retry.
  - On `invalid_request`, review inputs against schema.
- **Preserve history intent**: include `note` metadata when updating state (if accessible) to improve auditability.

## 6. Prompt Templates
- **“Design an energetic geometric poster”**
  1. `randomize({ scope: 'all' })` to establish fresh seeds.
  2. `set_state` to bump `parameters.numSides.value` and `parameters.curviness.value` for smooth, complex geometry.
  3. `set_layer` on key layers to assign bold color palettes (e.g., red, orange, magenta).
  4. `toggle_freeze({ value: true })` to pause motion for inspection.
- **“Create a calming ocean theme”**
  1. `set_state` with `globalSeed` set to a deterministic token (e.g., `"ocean-001"`).
  2. `set_state` to apply cool palette values or adjust `parameters.palette` if available.
  3. `set_layer` to reduce `opacity` and tweak `colors` to blues/greens on foreground layers.
- **“Add a new highlight layer with golden accents”**
  1. `add_layer` providing `layer.colors` in gold tones and `opacity` around `0.7`.
  2. `set_layer` (with returned `layerId`) to adjust `position` (`y` near `0.2`) and movement style (`orbit` for subtle motion).
- **“Spin the current composition slowly, then export state”**
  1. `set_state` to modify `parameters.movementStyle.value` to `"spin"` and reduce `movementSpeed`.
  2. `toggle_freeze({ value: false })` to observe motion, then `toggle_freeze({ value: true })` once satisfied.
  3. `export_state()` to capture a snapshot for later reuse.

## 7. Glossary
- **Seed**: Determines pseudo-random outcomes; deterministic given same value.
- **Layer**: Individual visual element (shape or image) contributing to the final render.
- **Palette**: Color configuration applied globally or per layer.
- **Freeze**: Stops animation, ensuring deterministic rendering.

## 8. Further Reading
- `MCP_USER_GUIDE.md`
- `MCP_TOOL_REFERENCE.md`
- `MCP_ARCHITECTURE.md`
