import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_BODY_BYTES = 1_048_576;

function authorized(header, token) {
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(header ?? '');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    let chunks = [];
    let oversized = false;
    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        oversized = true;
        chunks = [];
      } else if (!oversized) chunks.push(chunk);
    });
    request.on('end', () => {
      if (oversized) return reject(Object.assign(new Error('Request too large'), { status: 413 }));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    request.on('error', reject);
  });
}

/** Private conversion boundary. Authentication precedes parsing and licensed work. */
export function createExportServer({ token, convert, logger = console.error }) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('UNIVER_EXPORT_TOKEN must contain at least 32 characters.');
  let busy = false;
  const server = createServer(async (request, response) => {
    const json = (status, code) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(status === 200 ? { status: 'ok' } : { error: { code } }));
    };
    if (request.method === 'GET' && request.url === '/healthz') return json(200, 'OK');
    if (request.method !== 'POST' || request.url !== '/v1/export/xlsx') return json(404, 'NOT_FOUND');
    if (!authorized(request.headers.authorization, token)) return json(401, 'UNAUTHORIZED');
    if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return json(415, 'JSON_REQUIRED');
    if (Number(request.headers['content-length']) > MAX_BODY_BYTES) return json(413, 'PAYLOAD_TOO_LARGE');
    if (busy) return json(503, 'BUSY');
    // One admitted request at a time. The SDK owns license concurrency/usage accounting.
    busy = true;
    try {
      const body = await readBody(request);
      const workbook = body?.workbook;
      if (!workbook || typeof workbook !== 'object' || typeof workbook.id !== 'string' ||
          !Array.isArray(workbook.sheetOrder) || workbook.sheetOrder.length !== 1 || !workbook.sheets ||
          Object.keys(body).some((key) => key !== 'workbook')) return json(400, 'INVALID_WORKBOOK');
      const buffer = await convert(workbook);
      response.writeHead(200, { 'Content-Type': XLSX, 'Content-Length': buffer.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(buffer);
    } catch (error) {
      if (error.status === 400 || error.status === 413) return json(error.status, 'INVALID_REQUEST');
      logger(error);
      const unavailable = typeof error.code === 'string' && (error.code.startsWith('LICENSE_') || error.code === 'NATIVE_LOAD_FAILED');
      json(unavailable ? 503 : 502, unavailable ? 'EXPORT_UNAVAILABLE' : 'EXPORT_FAILED');
    } finally {
      busy = false;
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}

async function main() {
  const license = process.env.UNIVER_LICENSE?.trim();
  const licenseKey = process.env.UNIVER_LICENSE_KEY?.trim();
  if (!license || !licenseKey) throw new Error('Both Univer license variables must be configured.');
  // Use the SDK's CommonJS entry and standard npm native loader; no bundler rewrites.
  const require = createRequire(import.meta.url);
  const { exportToBuffer, getExportQuota, ExchangeFormat, FormulaCalculationMode } = require('@univerjs-pro/exchange-node');
  const { UniverInstanceType } = require('@univerjs/core');
  const credentials = { license, licenseKey };
  const redact = (error) => {
    const message = String(error?.message ?? error).replaceAll(license, '[redacted]').replaceAll(licenseKey, '[redacted]');
    console.error(`[univer-export] ${error?.code ?? 'ERROR'}: ${message}`);
  };
  const convert = async (workbook) => {
    const quota = await getExportQuota(credentials);
    if (quota.licenseStatus !== 'valid') throw Object.assign(new Error('A current commercial export license is required.'), { code: 'LICENSE_INVALID' });
    return exportToBuffer(workbook, { ...credentials, type: UniverInstanceType.UNIVER_SHEET, format: ExchangeFormat.XLSX, formulaCalculation: FormulaCalculationMode.NO });
  };
  const server = createExportServer({ token: process.env.UNIVER_EXPORT_TOKEN, convert, logger: redact });
  const port = Number(process.env.PORT ?? 3200);
  server.listen(port, '0.0.0.0', () => console.log(`[univer-export] Listening on port ${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`[univer-export] Startup failed: ${error.message}`); process.exitCode = 1; });
}
