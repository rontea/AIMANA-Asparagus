# AIMANA Asparagus
A local-first Digital Asset Management (DAM) system that combines asset organization with an AI-powered workspace for generating and managing multimedia content, including images, video, audio, chat interactions, and prompt-driven workflows. It is powered by Google and Pollinations.ai APIs and built using ChatGPT Codex and Gemini.

<img width="1983" height="793" alt="image" src="https://github.com/user-attachments/assets/335d64c4-8511-490a-a38c-c58c42fe0022" />

## How to Run the Application

### 1. Install the required software

Before running AIMANA Asparagus, install:

- **Node.js 18 or newer**
- **npm** (included with Node.js)
- **Git** if you need to clone the repository

Check your versions:

```bash
node --version
npm --version
```

### 2. Install project dependencies

From the project root folder, run:

```bash
npm install
```

### 3. Create a `.env` file

Create a `.env` file in the project root. For local development, start with:

```env
AUTH_SECRET=replace-this-with-a-long-random-secret
PORT=3001
BACKEND_PORT=3001
FRONTEND_PORT=3000
CHAT_WEB_SEARCH_PROVIDER=none
```

Optional API keys can be added when you want provider-backed features:

```env
API_KEY=your-google-ai-api-key
POLLINATIONS_API_KEY=your-pollinations-api-key
AIRFORCE_API_KEY=your-airforce-api-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_API_KEY=your-google-browser-api-key
TAVILY_API_KEY=your-tavily-api-key
CHAT_WEB_SEARCH_SEARXNG_URL=https://your-searxng-instance.example
```

Notes:

- `AUTH_SECRET` is required for safe authentication. Use a long random value.
- Google and Pollinations keys are optional, but related AI features will be unavailable until configured.
- If using Tavily search, set `CHAT_WEB_SEARCH_PROVIDER=tavily` and provide `TAVILY_API_KEY`.
- If using SearXNG search, set `CHAT_WEB_SEARCH_PROVIDER=searxng` and provide `CHAT_WEB_SEARCH_SEARXNG_URL`.

### 4. Run in development mode

Start the backend and frontend together:

```bash
npm run dev
```

By default:

- Frontend: `http://127.0.0.1:3000`
- Backend API: `http://127.0.0.1:3001`

The Vite dev server may open the browser automatically. If it does not, open `http://127.0.0.1:3000`.

### 5. Complete first-time setup

When the app opens for the first time, go through the install/setup screen:

```text
http://127.0.0.1:3000/#/install
```

Use the setup flow to confirm runtime settings, create the initial admin account, and finalize the installation.

### 6. Build and run production mode

Create a production build:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

Then open:

```text
http://127.0.0.1:3001
```

### 7. Useful commands

```bash
npm run dev
```

Run the local development server.

```bash
npm run build
```

Type-check and build the frontend into `dist`.

```bash
npm start
```

Run the built production app through the Node server.

```bash
npm test
```

Run frontend/unit tests with Vitest.

```bash
npm run test:server
```

Run backend tests.

```bash
npm run install:app
```

Run the source deployment installer. This installs dependencies, initializes the database, saves runtime configuration, and builds the production bundle.

### Troubleshooting

- If `npm run dev` says the backend did not become ready, make sure port `3001` is free or change `BACKEND_PORT` in `.env`.
- If the frontend port is busy, change `FRONTEND_PORT` in `.env`.
- If AI generation does not work, confirm the relevant API key is present in `.env`.
- If production mode shows `AIMANA Backend Active. Frontend build missing.`, run `npm run build` first.
- If setup reports an unsafe auth secret, replace `AUTH_SECRET` with a longer random value and restart the app.
