'use strict';

const https = require('https');
const crypto = require('crypto');

/**
 * Internet speed test. Runs entirely in the main process (not the renderer)
 * so the renderer's strict CSP (default-src 'self') never needs to be
 * relaxed for an external host — this is the one feature in the app that
 * intentionally makes a network connection, and only when the user presses
 * the button.
 *
 * Uses Cloudflare's public, unauthenticated speed-test endpoints
 * (speed.cloudflare.com/__down and /__up) — the same ones the
 * speed.cloudflare.com page and several open-source speed-test CLIs use.
 * No data is sent anywhere else, and nothing is uploaded except throwaway
 * random bytes generated locally for the upload measurement.
 *
 * Everything below resolves rather than throws from inside event-emitter
 * callbacks (data/error/timeout handlers) — those callbacks fire on their
 * own tick, outside the promise chain `runSpeedTest`'s caller awaits, so a
 * thrown error there becomes an uncaught exception in the main process
 * (an unrecoverable crash dialog) instead of a rejected/caught promise.
 * A flaky network should degrade the reading, never take down the app.
 */

const HOST = 'speed.cloudflare.com';
const DOWNLOAD_WINDOW_MS = 8000;
const UPLOAD_WINDOW_MS = 8000;
const DOWNLOAD_CHUNK_BYTES = 25_000_000; // well under Cloudflare's accepted range; we chain requests instead of asking for one huge one
const UPLOAD_CHUNK_BYTES = 64 * 1024;
const PING_SAMPLES = 6;
const SAMPLE_THROTTLE_MS = 100;
const REQUEST_TIMEOUT_MS = 15000;

async function measurePing(ctx) {
  const samples = [];
  for (let i = 0; i < PING_SAMPLES; i++) {
    if (ctx.cancelToken.cancelled) break;
    const t0 = process.hrtime.bigint();
    try {
      await new Promise((resolve, reject) => {
        const req = https.get({ host: HOST, path: '/__down?bytes=0', timeout: REQUEST_TIMEOUT_MS }, (res) => {
          res.on('data', () => {});
          res.on('end', resolve);
          res.on('error', () => resolve());
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('timeout')));
      });
    } catch (err) {
      if (i === 0) throw err; // no connectivity at all — surface it rather than reporting a fake 0ms ping
      break; // had at least one good sample; stop here and report what we have
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    samples.push(ms);
    ctx.onProgress?.({ phase: 'ping', stage: 'progress', sample: ms, done: i + 1, total: PING_SAMPLES });
  }
  if (samples.length === 0) return { pingMs: 0 };
  const pingMs = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { pingMs };
}

/** Downloads sequential chunks (never one giant request) until the time window is used up, cancelled, or a chunk fails — whichever comes first. Always resolves with whatever was measured. */
function measureDownload(ctx) {
  return new Promise((resolveOuter) => {
    const start = Date.now();
    let received = 0;
    let settled = false;
    let lastEmit = 0;
    let stopping = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      const elapsed = (Date.now() - start) / 1000;
      const mbps = elapsed > 0 ? (received * 8) / elapsed / 1_000_000 : 0;
      resolveOuter({ bytes: received, elapsed, mbps });
    };
    const timeUp = () => Date.now() - start >= DOWNLOAD_WINDOW_MS || ctx.cancelToken.cancelled;

    const requestChunk = () => {
      if (settled) return;
      if (timeUp()) { finish(); return; }

      let req;
      req = https.get({ host: HOST, path: `/__down?bytes=${DOWNLOAD_CHUNK_BYTES}`, timeout: REQUEST_TIMEOUT_MS }, (res) => {
        if (res.statusCode !== 200) { res.resume(); finish(); return; }
        res.on('data', (chunk) => {
          received += chunk.length;
          const now = Date.now();
          if (now - lastEmit >= SAMPLE_THROTTLE_MS) {
            lastEmit = now;
            const elapsed = (now - start) / 1000;
            const mbps = elapsed > 0 ? (received * 8) / elapsed / 1_000_000 : 0;
            ctx.onProgress?.({ phase: 'download', stage: 'progress', mbps, progress: Math.min(1, (now - start) / DOWNLOAD_WINDOW_MS) });
          }
          if (timeUp() && !stopping) { stopping = true; finish(); req.destroy(); }
        });
        res.on('end', () => { stopping = false; requestChunk(); });
        res.on('error', () => finish());
      });
      req.on('error', () => finish());
      req.on('timeout', () => { finish(); req.destroy(); });
    };

    requestChunk();
  });
}

/** Writes random bytes for the time window, honoring backpressure. Always resolves with whatever was measured. */
function measureUpload(ctx) {
  return new Promise((resolveOuter) => {
    const chunk = crypto.randomBytes(UPLOAD_CHUNK_BYTES);
    const start = Date.now();
    let sent = 0;
    let settled = false;
    let lastEmit = 0;
    let writing = false;

    const req = https.request(
      { host: HOST, path: '/__up', method: 'POST', timeout: REQUEST_TIMEOUT_MS, headers: { 'Content-Type': 'application/octet-stream' } },
      (res) => { res.on('data', () => {}); res.on('error', () => {}); }
    );
    req.on('error', () => finish());
    req.on('timeout', () => finish());

    const stopTimer = setTimeout(finish, UPLOAD_WINDOW_MS);

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(stopTimer);
      const elapsed = (Date.now() - start) / 1000;
      const mbps = elapsed > 0 ? (sent * 8) / elapsed / 1_000_000 : 0;
      try { if (!req.destroyed) req.destroy(); } catch { /* already closing */ }
      resolveOuter({ bytes: sent, elapsed, mbps });
    }

    function emitSample() {
      const now = Date.now();
      if (now - lastEmit >= SAMPLE_THROTTLE_MS) {
        lastEmit = now;
        const elapsed = (now - start) / 1000;
        const mbps = elapsed > 0 ? (sent * 8) / elapsed / 1_000_000 : 0;
        ctx.onProgress?.({ phase: 'upload', stage: 'progress', mbps, progress: Math.min(1, (now - start) / UPLOAD_WINDOW_MS) });
      }
    }

    function pump() {
      if (writing || settled) return;
      writing = true;
      try {
        let ok = true;
        let iterations = 0;
        while (ok) {
          if (settled || ctx.cancelToken.cancelled || Date.now() - start >= UPLOAD_WINDOW_MS || req.destroyed) {
            writing = false;
            finish();
            return;
          }
          ok = req.write(chunk);
          sent += chunk.length;
          emitSample();
          iterations += 1;
          if (iterations >= 500) { writing = false; setImmediate(pump); return; } // yield periodically so IPC (e.g. cancel) can still be processed
        }
      } catch {
        writing = false;
        finish();
        return;
      }
      writing = false;
      req.once('drain', pump);
    }

    pump();
  });
}

/**
 * Runs ping -> download -> upload in sequence, emitting progress via
 * ctx.onProgress({ phase, stage, ... }). Returns the final summary even if
 * cancelled or degraded partway through (whatever phases completed).
 */
async function runSpeedTest(ctx) {
  const result = { pingMs: null, downloadMbps: null, uploadMbps: null, cancelled: false, testedAt: null };

  ctx.onProgress?.({ phase: 'ping', stage: 'start' });
  const ping = await measurePing(ctx);
  result.pingMs = ping.pingMs;
  ctx.onProgress?.({ phase: 'ping', stage: 'done', pingMs: ping.pingMs });

  if (ctx.cancelToken.cancelled) { result.cancelled = true; result.testedAt = new Date().toISOString(); return result; }

  ctx.onProgress?.({ phase: 'download', stage: 'start' });
  const download = await measureDownload(ctx);
  result.downloadMbps = download.mbps;
  ctx.onProgress?.({ phase: 'download', stage: 'done', mbps: download.mbps });

  if (ctx.cancelToken.cancelled) { result.cancelled = true; result.testedAt = new Date().toISOString(); return result; }

  ctx.onProgress?.({ phase: 'upload', stage: 'start' });
  const upload = await measureUpload(ctx);
  result.uploadMbps = upload.mbps;
  ctx.onProgress?.({ phase: 'upload', stage: 'done', mbps: upload.mbps });

  result.cancelled = ctx.cancelToken.cancelled;
  result.testedAt = new Date().toISOString();
  return result;
}

module.exports = { runSpeedTest };
