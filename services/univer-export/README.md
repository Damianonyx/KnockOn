# KnockOn Excel conversion service

The main app stays on Vercel. This small private Node service turns a saved Univer workbook into an Excel file. It needs persistent local storage for Univer's license-usage state, including with an unlimited license. A Vercel Function does not provide that storage.

Charts and worksheet printing do not need this service. Until it is hosted and connected, KnockOn disables **Export Excel** and displays an unavailable message.

## Run with Docker

On a Linux host with Docker Compose:

```bash
cd services/univer-export
cp .env.example .env
# Fill .env with both license file contents and a generated export token.
docker compose up -d --build
curl http://127.0.0.1:3200/healthz
```

Generate the token once with `node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'`. Put it in the service's `.env` and the app's `UNIVER_EXPORT_TOKEN` setting. Both license file contents go in the service environment as `UNIVER_LICENSE` and `UNIVER_LICENSE_KEY`. No credentials are included in the image.

Compose binds the port to localhost and keeps the SDK's state in a named volume mounted at `/home/node/.local/state`. Put an HTTPS reverse proxy in front of port 3200. For example, a host-level Caddy configuration can use:

```caddyfile
exports.your-domain.example {
    reverse_proxy 127.0.0.1:3200
}
```

The domain must point to your host. Keep one service instance using the same state volume across upgrades and restarts. Do not delete or roll back license-usage state to reset counts. The SDK owns its files and quota enforcement. For upgrades, run `docker compose up -d --build`; do not use `down -v`.

A managed Docker web service with an attached persistent disk is another option. For example, [Render supports persistent disks on paid services](https://render.com/docs/disks). Use this folder as the Docker build context, mount the disk at `/home/node/.local/state`, make it writable by the image's `node` user, set the three private environment values, and use `/healthz` as the health check. Hosting must be selected and provisioned separately; this repository does not create a paid service automatically.

## Connect KnockOn

In Vercel's project environment settings, set:

```dotenv
UNIVER_EXPORT_URL="https://exports.your-domain.example/v1/export/xlsx"
UNIVER_EXPORT_TOKEN="the-same-token-as-the-service"
```

Set them for the intended Preview and Production environments and redeploy. `UNIVER_LICENSE` still belongs in Vercel for browser charts and printing. `UNIVER_LICENSE_KEY` is used only by this conversion service. The supplied license expires on **3 December 2026**; update the service credentials and browser license when it is renewed.

The browser calls KnockOn's own export API. KnockOn verifies visitor ownership, revision and saved calculation status, then sends the saved workbook to this service with a Bearer token. The service accepts only authenticated JSON requests, caps bodies at 1 MiB, admits one conversion at a time, and returns the XLSX bytes. Neither license credentials nor the service token are sent to the browser. A busy or unavailable service returns an error without automatic retries.

The health check confirms the process is reachable. An actual export is needed to verify licensing and the persistent volume.

## Local development and verification

```bash
npm ci
npm test
node --env-file=.env server.mjs
```

For a local app, set `UNIVER_EXPORT_URL=http://127.0.0.1:3200/v1/export/xlsx` and the same token in the app's ignored `.env.local`, then restart it. From the repository root, `npm run e2e:pro` exercises the complete browser → app API → service → licensed converter → Excel download flow. It creates demo data and uses no Ling credits. Use `BASE_URL` and `CHROMIUM_PATH` if needed.

Service tests cover authorization, body validation, overlapping requests and safe license-error responses. Logs retain SDK diagnostics with license values redacted; application responses never expose them. Preserve any usage-storage error for support instead of clearing the state or repeatedly resubmitting exports.

References: [Univer file exchange](https://docs.univer.ai/server/import-export), [license configuration](https://docs.univer.ai/server/license).
