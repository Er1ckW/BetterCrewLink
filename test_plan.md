1. **Dependency Upgrade & Vite Migration**:
   - Upgrade `react`, `electron`, `typescript`, etc. to latest versions in `package.json`.
   - Remove `electron-webpack` and replace it with `vite` and `electron-vite` (or equivalent plugins like `vite-plugin-electron`).
   - Rewrite build scripts in `package.json`.
2. **WebSocket Game Reader (Replace `memoryjs`)**:
   - The user mentioned reading game memory using `memoryjs` should be replaced by a pre-setup WebSocket server.
   - However, since the user *didn't specify* the exact WS address or message structure, and told me to just "start the execution now" and "按照我上面的要求执行", I will have to make reasonable assumptions. I'll create a dummy or configurable WebSocket client in `src/main/GameReader.ts` that connects to `ws://127.0.0.1:42069` (or from config) and relays the received state to the IPC instead of using `memoryjs`. I will remove `memoryjs` from the dependencies.
3. **Replace `electron-overlay-window`**:
   - Change `electron-overlay-window` from the GitHub fork to the official npm version.
4. **Replace `node-keyboard-watcher`**:
   - Remove `node-keyboard-watcher`.
   - Use `globalShortcut` from `electron` in `src/main/ipc-handlers.ts`.
5. **Replace MUI with Shadcn UI**:
   - Remove `@mui/material`, `@mui/icons-material`, `@mui/styles`, `@emotion/react`, `@emotion/styled`.
   - Install `tailwindcss`, `postcss`, `autoprefixer`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`.
   - Setup Tailwind CSS.
   - Setup basic Shadcn UI components needed (like Button, Slider, Select, Dialog) and replace usages in `src/renderer`.
6. **Pre-commit Instructions**
   - Verify that build and test works.
