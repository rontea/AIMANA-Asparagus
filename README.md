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

# Environment Configuration

This file documents the environment variables AIMANA currently reads from the codebase.

## Core Runtime

```env
FRONTEND_PORT=3000
BACKEND_PORT=3001
PORT=3001
AUTH_SECRET=change-me
NODE_ENV=development
VITE_OPEN=true
DEV_BACKEND_READY_TIMEOUT_MS=60000
DEV_PROBE_ONLY=false
ALLOW_DEMO_ADMIN_BOOTSTRAP=false
ALLOW_DEMO_ADMIN_LOGIN=false
```

- `FRONTEND_PORT` is used by Vite dev server.
- `BACKEND_PORT` or `PORT` controls the Express server.
- `AUTH_SECRET` is required for stable bearer token signing outside local demo use.
- `VITE_OPEN=false` prevents the dev server from opening a browser automatically.
- `DEV_BACKEND_READY_TIMEOUT_MS` controls how long `npm run dev` waits for the backend health check.
- `DEV_PROBE_ONLY=true` starts the backend, checks readiness, then exits without starting Vite.
- `ALLOW_DEMO_ADMIN_BOOTSTRAP` enables demo admin seeding outside normal development/test flows.
- `ALLOW_DEMO_ADMIN_LOGIN` enables demo login recovery outside normal development/test flows.

## AI Providers

```env
API_KEY=
POLLINATIONS_API_KEY=
POLLINATIONS_KEY=
NVIDIA_API_KEY=
AIRFORCE_API_KEY=
```

- `API_KEY` is the primary Google provider key.
- `POLLINATIONS_API_KEY` is read both at startup and at runtime for registry sync and proxy calls.
- `POLLINATIONS_KEY` is an optional Pollinations key alias used by Prompt Assistant embeddings and RAG chat. If both Pollinations variables are set, `POLLINATIONS_KEY` takes precedence for Prompt Assistant calls.
- `NVIDIA_API_KEY` is used by the proxy for NVIDIA NIM chat-completions models such as MiniMax-M3.
- `AIRFORCE_API_KEY` is used by the proxy for AirForce-backed requests.

## Prompt Assistant RAG

```env
RAG_ENABLED=false
RAG_EMBEDDING_MODEL=openai-3-small
RAG_CHAT_MODEL=openai
RAG_TOP_K=8
RAG_EMBEDDING_TIMEOUT_MS=60000
RAG_CHAT_TIMEOUT_MS=60000
RAG_LOCAL_EMBEDDING_FALLBACK=true
RAG_AUTO_INDEX_ON_EMPTY=true
```

- `RAG_ENABLED=true` enables Prompt Assistant chat and admin re-index requests. The conservative local default is `false` so development installs do not make Pollinations embedding/chat calls accidentally.
- `RAG_EMBEDDING_MODEL` controls the Pollinations OpenAI-compatible embeddings model used when indexing and retrieving local RAG chunks.
- `RAG_CHAT_MODEL` controls the Pollinations text model used to write grounded Prompt Assistant answers.
- `RAG_TOP_K` controls the default number of matching chunks retrieved for assistant context.
- `RAG_EMBEDDING_TIMEOUT_MS` and `RAG_CHAT_TIMEOUT_MS` control Pollinations request timeouts for RAG operations.
- `RAG_LOCAL_EMBEDDING_FALLBACK` allows the app to use local hash embeddings when Pollinations embeddings are unavailable or unconfigured.
- `RAG_AUTO_INDEX_ON_EMPTY` lets an admin request trigger indexing when the RAG corpus is empty.
- Prompt Assistant indexing and chat require either `POLLINATIONS_KEY` or `POLLINATIONS_API_KEY`.

## Chat Web Search

```env
CHAT_WEB_SEARCH_MODE=native
CHAT_WEB_SEARCH_PROVIDER=none
CHAT_WEB_SEARCH_RETRIES=1
CHAT_WEB_SEARCH_TIMEOUT_MS=8000
CHAT_WEB_SEARCH_ALLOW_DOMAINS=
CHAT_WEB_SEARCH_DENY_DOMAINS=
CHAT_WEB_SEARCH_MONITORING_ENABLED=false
CHAT_WEB_SEARCH_MONITORING_SAMPLE_RATE=1
CHAT_WEB_SEARCH_FORCE_FALLBACK_PROVIDERS=
CHAT_WEB_SEARCH_FORCE_FALLBACK_MODELS=
TAVILY_API_KEY=
TAVILY_API_URL=https://api.tavily.com/search
CHAT_WEB_SEARCH_SEARXNG_URL=
```

- `CHAT_WEB_SEARCH_MODE` accepts `off`, `native`, or `fallback`.
- `CHAT_WEB_SEARCH_PROVIDER` currently supports `none`, `tavily`, and `searxng`.
- Allow and deny lists are parsed as comma, newline, semicolon, or pipe-separated domain lists.

## Chat URL Ingest

```env
CHAT_URL_INGEST_TIMEOUT_MS=8000
CHAT_URL_INGEST_MAX_BYTES=1000000
CHAT_URL_INGEST_MAX_CHARS=4000
CHAT_URL_INGEST_MAX_LINKS=3
CHAT_URL_INGEST_MAX_CONTEXT_CHARS=8000
```

These values cap the optional link-ingest feature used by AI Chat when link context is enabled.

## Google Identity and Drive

```env
GOOGLE_CLIENT_ID=
GOOGLE_API_KEY=
ALLOW_MOCK_GOOGLE_AUTH=false
```

- `GOOGLE_CLIENT_ID` is required for real Google login and browser-side Google Drive access.
- `GOOGLE_API_KEY` is used by the Drive browser client.
- `ALLOW_MOCK_GOOGLE_AUTH=true` only makes sense in non-production testing.

## Recommended Local Setup

1. Create a `.env` file in the project root.
2. Set a real `AUTH_SECRET`.
3. Add `API_KEY` if you want Google-backed AI routes.
4. Add `POLLINATIONS_API_KEY` or `POLLINATIONS_KEY` and set `RAG_ENABLED=true` if you want the Prompt Assistant RAG flow.
5. Add `GOOGLE_CLIENT_ID` and `GOOGLE_API_KEY` only if you need Google login or Drive projects.
6. Leave the web search provider as `none` unless you are actively testing fallback search.

## Installer Config Flow

The installer now supports runtime config management through the backend:

- `GET /api/app/bootstrap/runtime-config` returns the approved install-time config fields with masked values for secrets.
- `PUT /api/app/bootstrap/runtime-config` writes supported values into the project `.env`.
- The installer can generate a fresh `AUTH_SECRET` server-side without exposing the generated raw secret back through read endpoints.

Current install-time config categories:

- Core security
- AI providers
- Identity and Drive
- Fallback web search

The installer intentionally treats provider keys as optional and explains the feature impact of leaving them unset.
