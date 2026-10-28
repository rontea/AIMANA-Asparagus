# Environment Variable Reference

[← Back to Documentation Index](./README.md)

This reference explains the variables currently present in the repository's root `.env` file. It documents their purpose without reproducing configured values, since `.env` can contain private credentials. Some other optional variables are read by the code but are not currently listed in this `.env` file.

The application loads `.env` from the project root. After changing a value, restart the relevant server or development process for it to take effect. Keep real credentials out of source control and use a unique `AUTH_SECRET` for each deployment.

## Runtime and security

| Variable | What it controls | Values and notes |
| --- | --- | --- |
| `NODE_ENV` | Selects the Node.js runtime mode. Some authentication and demo-login behavior changes in production. | Common values are `development` and `production`. |
| `FRONTEND_PORT` | Port used by the Vite development server. | Defaults to `3000` when unset. |
| `BACKEND_PORT` | Port used by the Express backend and the Vite development proxy. | Defaults to `3001`. An optional `PORT` variable takes precedence if set. |
| `AUTH_SECRET` | Signs authentication session and verification tokens. | Set a long, random, private value. Required for safe authentication in release deployments; changing it invalidates existing sessions/tokens. |

## AI providers

| Variable | What it controls | Values and notes |
| --- | --- | --- |
| `API_KEY` | Server-side Google AI/Gemini credential used by Google-backed AI features. | Optional; needed only for features that call Google AI. Requests use the authenticated backend, so this credential stays out of the browser bundle. |
| `POLLINATIONS_APP_KEY` | Identifies AIMANA in Pollinations' Bring Your Own Provider authorization flow. | Optional publishable app key (typically starts with `pk_`). It does not replace the server API key used for generation. |
| `POLLINATIONS_API_KEY` | Server credential for Pollinations generation and model-registry sync. It can also be used by Prompt Assistant when `POLLINATIONS_KEY` is not set. | Optional; required for the Pollinations-backed features you use. Treat as a secret. |
| `POLLINATIONS_KEY` | Pollinations key used by Prompt Assistant embeddings and chat. | Optional alias. For Prompt Assistant calls it takes precedence over `POLLINATIONS_API_KEY` when both are set. Treat as a secret. |
| `AIRFORCE_API_KEY` | Credential for supported AirForce AI provider requests. | Optional; needed only when using AirForce-backed models. Treat as a secret. |

## Chat web search

| Variable | What it controls | Values and notes |
| --- | --- | --- |
| `CHAT_WEB_SEARCH_MODE` | Default search mode for AI Chat. | `native` (default), `fallback`, or `off`. A request can supply its own mode; configured forced-fallback rules also apply. |
| `CHAT_WEB_SEARCH_PROVIDER` | Provider used for server-side fallback search. | `none` (default), `tavily`, or `searxng`. Fallback requires the matching provider credential or URL. |
| `CHAT_WEB_SEARCH_RETRIES` | Number of retries for retryable fallback-search errors. | Defaults to `1`; the service limits this setting to 0–3. |
| `CHAT_WEB_SEARCH_TIMEOUT_MS` | Timeout for a fallback-search provider request. | Defaults to `8000` milliseconds. |
| `CHAT_WEB_SEARCH_MAX_RESULTS` | Appears in the current `.env` file as a search-result limit setting. | The current application code does not read this variable. Search results are capped using the request's `maxResults` value (default 5, maximum 10). |
| `CHAT_WEB_SEARCH_ALLOW_DOMAINS` | Optional domain allowlist for fallback-search results. | Empty means no allowlist filter. Separate domains with commas, newlines, semicolons, or `|`. |
| `CHAT_WEB_SEARCH_DENY_DOMAINS` | Optional domain denylist for fallback-search results. | Empty means no denylist filter. Separate domains with commas, newlines, semicolons, or `|`. |
| `CHAT_WEB_SEARCH_MONITORING_ENABLED` | Enables recording search diagnostics such as mode, provider, latency, and filtering counts. | Boolean; `true` enables it. Defaults to disabled. |
| `CHAT_WEB_SEARCH_MONITORING_SAMPLE_RATE` | Fraction of eligible search requests recorded when monitoring is enabled. | Number from `0` to `1`; `1` records all eligible requests. |
| `CHAT_WEB_SEARCH_FORCE_FALLBACK_PROVIDERS` | Forces fallback search for listed AI provider identifiers. | Optional list, separated by commas, newlines, semicolons, or `|`. |
| `CHAT_WEB_SEARCH_FORCE_FALLBACK_MODELS` | Forces fallback search for listed model IDs or upstream model IDs. | Optional list, using the same separators as the provider list. |
| `TAVILY_API_KEY` | Credential for Tavily fallback search. | Required when `CHAT_WEB_SEARCH_PROVIDER=tavily`. Treat as a secret. |
| `TAVILY_API_URL` | Tavily search endpoint. | Defaults to `https://api.tavily.com/search` when unset; change it only when using a compatible endpoint. |
| `CHAT_WEB_SEARCH_SEARXNG_URL` | Base URL of the SearXNG instance used for fallback search. | Required when `CHAT_WEB_SEARCH_PROVIDER=searxng`. |

## Chat URL ingestion

These settings limit how much content AI Chat reads when URL context is enabled. Values are milliseconds, bytes, or character/link counts as indicated.

| Variable | What it controls | Default and accepted range |
| --- | --- | --- |
| `CHAT_URL_INGEST_TIMEOUT_MS` | Maximum time to fetch and extract one URL. | `8000` ms; clamped to 1000–30000. |
| `CHAT_URL_INGEST_MAX_BYTES` | Maximum response size fetched for a URL. | `1000000` bytes; clamped to 65536–5242880. |
| `CHAT_URL_INGEST_MAX_CHARS` | Maximum extracted characters retained per URL. | `4000`; clamped to 500–20000. |
| `CHAT_URL_INGEST_MAX_LINKS` | Maximum number of URLs included in one request. | `3`; clamped to 1–10. |
| `CHAT_URL_INGEST_MAX_CONTEXT_CHARS` | Maximum combined URL context added to the AI prompt. | `8000`; clamped to 1000–40000. |

## Google identity and Drive

| Variable | What it controls | Values and notes |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth client ID used for Google sign-in. | Optional; configure a matching Google OAuth project to enable Google login. |
| `GOOGLE_API_KEY` | Browser-facing Google API key used by Drive integration. | This value is visible in the browser by design. Restrict it in Google Cloud by allowed HTTP referrers and APIs; it does not replace the server-side `API_KEY`. |

## Prompt Assistant RAG

| Variable | What it controls | Values and notes |
| --- | --- | --- |
| `RAG_ENABLED` | Enables Prompt Assistant retrieval-augmented chat and admin re-index requests. | Set to `true` to enable; the default is disabled. Accepted true values include `true`, `1`, `yes`, and `on`. |
| `RAG_EMBEDDING_MODEL` | Pollinations embedding model used to index and retrieve local content. | Defaults to `openai-3-small`. |
| `RAG_CHAT_MODEL` | Pollinations text model used to write grounded Prompt Assistant answers. | Defaults to `openai`. |
| `RAG_TOP_K` | Default number of matching content chunks included in assistant context. | Defaults to `8`. |

Prompt Assistant RAG needs either `POLLINATIONS_KEY` or `POLLINATIONS_API_KEY` for remote embeddings and chat. Local embedding fallback is enabled by default when remote embeddings are unavailable or unconfigured.

## Migration and installer note

Backups do not carry `.env` credentials to another server. Keep the destination's `.env`, then configure its own authentication secret and any integrations needed there. See the [Installation Instructions](./installation.md) and [Manual Migration Guide](./migration.md) for the setup and migration procedures.

---

[← Back to Documentation Index](./README.md)
