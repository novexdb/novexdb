# Contributing to NovexDB

Thanks for thinking about contributing! This file covers the bare-minimum
rules; the rest is in the [README](README.md).

## Before you open a PR

1. **Open an issue first** for anything bigger than a typo or a one-line fix.
   It saves both of us hours when we agree on the approach up front.
2. **Run the full check locally:**
   ```bash
   npm run typecheck
   npm run lint
   npm run test:run
   ```
   All three must pass. CI runs them too.
3. **Match the surrounding style.** ESLint + Prettier handle most of it.
   No new style debates — this is a tiny project, consistency wins over
   personal preference.

## Setup

```bash
git clone https://github.com/Asif-Saheer-k/novexdb.git
cd novexdb
npm install
npm run dev
```

That last command opens Electron pointed at the Vite dev server. Renderer
changes hot-reload; main-process changes need a `Cmd+R` (or restart the
dev server).

To run the marketing site instead:

```bash
cd website && npm install && npm run dev
```

## Adding tests

We use [Vitest](https://vitest.dev). Co-locate tests next to the code:

```
src/main/services/ai/sql-safety.ts
src/main/services/ai/sql-safety.test.ts
```

Aim for **pure helpers** (no IO mocking required). Anything that touches
the database driver / Electron APIs / the network is integration-level
and we don't have a harness for that yet — feel free to propose one.

## Architecture cheat-sheet

- **Three processes**: `src/main/` (Node + Electron APIs), `src/preload/`
  (the typed contextBridge), `src/renderer/` (React). They never talk
  directly — always through the IPC contract in `src/shared/ipc-contract.ts`.
- **State**: Zustand stores in `src/renderer/**/stores/`. One store per
  feature. Selectors return stable references — see existing stores for
  the `EMPTY_SLICE` pattern.
- **AI**: provider-agnostic. The `LlmProvider` interface in
  `src/main/services/ai/providers/provider.types.ts` is implemented by
  both `AnthropicProvider` and `OpenAIProvider`. New providers slot in
  the same way.
- **IPC**: `registerHandler<S, T>(channel, schema, handler)` for
  request/response with zod validation; `ipcMain.on` for streaming
  (chat, dump import, scans).

## Adding a new database engine

The driver interface is `DatabaseDriver` in
`src/main/services/drivers/types.ts`. New engines need:

1. A class implementing the interface (`connect`, `disconnect`,
   `execute`, `introspect`, `fetchTable`, `mutateTable`, `explain`, …).
2. A factory entry in `src/main/services/drivers/index.ts`.
3. A zod schema for the connection config in
   `src/shared/schemas/connection.schema.ts`.
4. A connection-form section in
   `src/renderer/features/connections/components/ConnectionModal.tsx`.

The Postgres and MySQL drivers are good templates.

## Commit messages

Conventional Commits is encouraged but not enforced:

```
feat(ai): add OpenAI provider with Structured Outputs
fix(grid): preserve row selection across page swaps
chore: bump electron to 38.2
```

## Code of conduct

Be excellent to each other. Disagreements about code are fine; personal
attacks are not. We follow the
[Contributor Covenant](https://www.contributor-covenant.org/) in spirit.

## License

By contributing you agree that your contributions will be licensed under
the project's [MIT License](LICENSE).
