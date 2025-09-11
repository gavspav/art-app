# Repository Guidelines

## Project Structure & Module Organization
- App code lives in `src/`:
  - `components/` React components (PascalCase filenames, e.g., `Canvas.jsx`).
  - `pages/`, `context/`, `hooks/` (custom hooks start with `use`), `utils/`, `constants/`, `config/`.
  - Tests live alongside code under `__tests__/` (e.g., `src/utils/__tests__/layerHash.test.js`).
- Static assets: `public/` (served as-is) and `src/assets/` for imported assets.
- Build output: `dist/` (ignored by linting).

## Build, Test, and Development Commands
- `npm run dev` — Start Vite dev server with React Fast Refresh.
- `npm run build` — Production build to `dist/`.
- `npm run preview` — Preview the production build locally.
- `npm run lint` — Run ESLint across the project.
- `npm test` — Placeholder. Add Vitest or Jest to enable real tests.

Example: `npm run dev` then open the printed local URL.

## Coding Style & Naming Conventions
- JavaScript/JSX with ES modules; React 19 + Vite.
- Use 2-space indentation and descriptive names.
- Filenames: components `PascalCase.jsx`, utilities/hooks `camelCase.js` (`useXyz.js`).
- Keep modules small; colocate closely related files.
- Linting: ESLint (recommended rules + React Hooks + React Refresh). No unused variables (except UPPER_CASE globals allowed). Run `npm run lint` before PRs.

## Testing Guidelines
- Framework: add Vitest (recommended) or Jest. Tests already use `describe/test/expect` style.
- Test files: `*.test.js` under `__tests__/` or next to the module.
- Aim for fast unit tests for `utils/` and behavior tests for hooks/components.
- Suggested scripts after adding Vitest:
  - `npm test` → `vitest run`
  - `npm run test:ui` → `vitest`

## Commit & Pull Request Guidelines
- Commits: concise, imperative mood (e.g., "Fix layer hash edge cases"). Group related changes.
- PRs: include a clear description, rationale, screenshots for UI changes, and link issues if applicable. Ensure `npm run lint` passes and the app builds.

## Security & Configuration Tips
- Do not commit secrets. Use `.env` (Vite uses `import.meta.env`) and add to `.gitignore`.
- Keep dependencies minimal; run `npm audit` periodically.

## Agent-Specific Instructions
- This file applies repo-wide. Prefer minimal, surgical changes that match existing structure and naming. When adding tests or scripts, place them under the existing folders noted above.

