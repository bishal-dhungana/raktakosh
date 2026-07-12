# Installation and Execution Guide

## Prerequisites

- Node.js 24 or later
- npm 11 or later
- Windows PowerShell, Command Prompt, or a compatible terminal

## First-time setup

1. Open a terminal in the project directory.
2. Install dependencies:

   ```powershell
   npm install
   ```

3. Start the complete application:

   ```powershell
   npm run dev
   ```

The command starts both services:

| Service | Address | Purpose |
|---|---|---|
| Web interface | `http://localhost:5173` | React/Vite client application |
| Application API | `http://localhost:8787` | Express API and SQLite-backed workflow service |

The browser opens automatically when the web interface is ready. Keep the terminal window open while using the system.

## Windows launcher

After `npm install` has been completed once, double-click `START-RAKTAKOSH.cmd` from File Explorer to start the application.

## Presentation reset

Use the reset command before a formal presentation to restore the initial request, inventory, donor, and audit dataset:

```powershell
npm run reset-data
npm run dev
```

Run the reset command only while the application is stopped.

## Validation commands

```powershell
npm test
npm run build
```

`npm run build` performs TypeScript checking and generates the web bundle in `dist/`. To serve that bundle locally:

```powershell
npm run serve
```

Then open `http://localhost:8787`.

## If localhost does not open

1. Confirm the terminal still shows both `API` and `WEB` processes running.
2. Open `http://localhost:5173` manually.
3. If port 5173 is already occupied, stop the earlier terminal process and run `npm run dev` again.
4. If dependencies are missing, rerun `npm install`.
