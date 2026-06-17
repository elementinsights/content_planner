# Setup

Everything is optional. With no keys the system runs in **structural mode** (full plan, `null` metrics, Sheets dry-run). Add keys to unlock live data and a real Google Sheet.

## 1. Install

```bash
npm install        # Node >= 22 (uses built-in node:sqlite). No build step; runs via tsx.
cp .env.example .env
```

## 2. SEO providers

### Ahrefs (PRIMARY — preferred)
1. Get an **Ahrefs API v3** token (Enterprise/API plan).
2. Set `AHREFS_API_KEY=...` in `.env`.

> Ahrefs API tiers and exact endpoint/field names vary by subscription. The adapter (`src/providers/seo/ahrefs.ts`) targets the documented v3 shape and **maps defensively** — anything it can't read stays `null` (never fabricated). Confirm endpoint paths against your plan; adjust the constants if your tier differs.

### DataForSEO (SECONDARY — SERP + volume/trend supplement, backup)
1. Create a DataForSEO account → API login/password.
2. Set `DATAFORSEO_LOGIN=...` and `DATAFORSEO_PASSWORD=...`.

DataForSEO provides the **SERP layer** (organic results + features for SERP-overlap, weakness, and cannibalization checks) and a secondary volume/KD supplement. It is **not** primary unless Ahrefs is absent.

### Semrush (optional, future)
`SEMRUSH_API_KEY=...` wires a scaffolded adapter (returns `null` until endpoint mapping is implemented for your plan).

## 3. Google Sheets (the human review layer)

Sheets is where editors review and approve. Use a **service account**.

1. **Create / pick a Google Cloud project** → <https://console.cloud.google.com>.
2. **Enable APIs**: *Google Sheets API* (and *Google Drive API* if you want the tool to create new spreadsheets).
3. **Create a Service Account**: IAM & Admin → Service Accounts → Create. Then **Keys → Add key → JSON** and download it.
4. Put the credentials in `.env`, either inline:
   ```
   GOOGLE_SHEETS_CLIENT_EMAIL=svc@your-project.iam.gserviceaccount.com
   GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```
   (escape newlines as `\n`), **or** point to the JSON file:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/abs/path/service-account.json
   ```
5. **Target spreadsheet:**
   - To sync into an **existing** sheet: create it, **share it with the service-account email as Editor**, and set `GOOGLE_SHEETS_SPREADSHEET_ID=...`.
   - To let the tool **create** one: leave `GOOGLE_SHEETS_SPREADSHEET_ID` blank (needs Drive API enabled). Share/transfer ownership afterward as desired.

Run `npm run plan -- --config examples/ai-tools-for-marketers.json`. Without creds it logs a **dry-run** and mirrors every tab to `output/csv/`. With creds it creates/updates tabs and **preserves protected human columns**.

Force dry-run even with creds: `--dry-run-sheets`. Skip Sheets entirely: `--no-sync`.

## 4. Post-launch feedback (after pages exist)

- **GSC**: `GSC_CREDENTIALS` (service-account JSON string) + `GSC_SITE_URL`. Reuse the Sheets service account; grant it access in Search Console.
- **GA4**: `GA4_PROPERTY_ID` + the same credentials; grant the service account *Viewer* on the GA4 property.

These power the post-launch loop and stay empty/`AWAITING_GSC_GA4` until configured. They are **feedback-layer** providers, not pre-launch research.

## 5. Optional LLM intake

The intake module is **deterministic by default** (no network). To use an LLM instead:

```
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-opus-4-8
```
…then `npm i @anthropic-ai/sdk` (or `LLM_PROVIDER=openai` + `npm i openai`). If the SDK is missing or the call fails, it **falls back to the deterministic interpreter** — runs never hard-fail on the LLM.

## 6. Cost controls

`.env`: `SEO_MAX_PROVIDER_CALLS`, `SEO_MAX_LLM_CALLS`, `SEO_MAX_USD` (hard caps; a run aborts external calls past the budget), `SEO_LOG_LEVEL`, `SEO_DB_PATH`.
