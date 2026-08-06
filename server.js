import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { runBatch, parsePromoters } from "./fill-form.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = join(__dirname, "form-data.json");

const job = {
  running: false,
  stopRequested: false,
  startedAt: null,
  finishedAt: null,
  config: null,
  current: 0,
  total: 0,
  succeeded: 0,
  failed: 0,
  logs: [],
  results: [],
  error: null,
};

function pushLog(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  job.logs.push(line);
  if (job.logs.length > 500) job.logs.shift();
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function getStatus() {
  return {
    running: job.running,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    config: job.config,
    current: job.current,
    total: job.total,
    succeeded: job.succeeded,
    failed: job.failed,
    logs: job.logs,
    results: job.results.slice(-50),
    error: job.error,
  };
}

function loadDefaults() {
  if (existsSync(DATA_FILE)) {
    try {
      return JSON.parse(readFileSync(DATA_FILE, "utf8"));
    } catch {
      /* ignore */
    }
  }
  return {
    language: "हिंदी",
    promoters: "",
    count: 1000,
    perMinuteMin: 5,
    perMinuteMax: 14,
  };
}

async function startJob(input) {
  if (job.running) {
    throw new Error("A job is already running");
  }

  const promotersRaw = String(input.promoters ?? input.promoter ?? "").trim();
  const promoters = parsePromoters(promotersRaw);
  const count = Number(input.count);
  const perMinuteMin = Number(input.perMinuteMin ?? input.perMinute ?? 5);
  const perMinuteMax = Number(input.perMinuteMax ?? input.perMinute ?? 14);
  const language = String(input.language || "हिंदी").trim();

  if (promoters.length === 0) {
    throw new Error("Enter at least one promoter id (e.g. 48,49,53)");
  }
  if (!Number.isFinite(count) || count < 1 || count > 10000) {
    throw new Error("Count per promoter must be between 1 and 10000");
  }
  if (
    !Number.isFinite(perMinuteMin) ||
    !Number.isFinite(perMinuteMax) ||
    perMinuteMin < 1 ||
    perMinuteMax > 60 ||
    perMinuteMin > perMinuteMax
  ) {
    throw new Error("Per-minute range must be 1–60 with min ≤ max");
  }

  const total = promoters.length * count;
  const config = {
    language,
    promoters,
    count,
    perMinuteMin,
    perMinuteMax,
    random: true,
  };

  job.running = true;
  job.stopRequested = false;
  job.startedAt = new Date().toISOString();
  job.finishedAt = null;
  job.config = config;
  job.current = 0;
  job.total = total;
  job.succeeded = 0;
  job.failed = 0;
  job.logs = [];
  job.results = [];
  job.error = null;

  const avg = (perMinuteMin + perMinuteMax) / 2;
  pushLog(
    `Job queued: ${promoters.length} promoters × ${count} = ${total} forms, random ${perMinuteMin}–${perMinuteMax}/min (~${Math.ceil(total / avg)} min)`
  );
  pushLog(`Promoters: ${promoters.join(", ")}`);

  // Run in background
  setImmediate(async () => {
    try {
      const summary = await runBatch(config, {
        headless: true,
        shouldStop: () => job.stopRequested,
        onLog: (msg) => pushLog(String(msg).trimEnd()),
        onProgress: ({ current, total: t, results }) => {
          job.current = current;
          job.total = t;
          job.results = results;
          job.succeeded = results.filter((r) => r.status === "success").length;
          job.failed = results.filter((r) => r.status === "failed").length;
        },
      });
      job.succeeded = summary.succeeded;
      job.failed = summary.failed;
      job.results = summary.results;
      job.current = summary.total;
    } catch (error) {
      job.error = error.message;
      pushLog(`Fatal: ${error.message}`);
    } finally {
      job.running = false;
      job.finishedAt = new Date().toISOString();
      pushLog("Job finished.");
    }
  });
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Form Bot</title>
  <style>
    :root {
      --bg: #0f1419;
      --panel: #1a2332;
      --border: #2d3a4d;
      --text: #e7ecf3;
      --muted: #8b9bb4;
      --accent: #3d9cf0;
      --accent-hover: #5aadf5;
      --danger: #e85d5d;
      --ok: #3ecf8e;
      --warn: #e8b84a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: radial-gradient(ellipse at top, #1a2740 0%, var(--bg) 55%);
      color: var(--text);
      padding: 2rem 1rem 3rem;
    }
    main {
      max-width: 640px;
      margin: 0 auto;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin: 0 0 0.35rem;
      letter-spacing: -0.02em;
    }
    .sub {
      color: var(--muted);
      font-size: 0.9rem;
      margin-bottom: 1.75rem;
    }
    form, .status-panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem 1.35rem;
      margin-bottom: 1.25rem;
    }
    label {
      display: block;
      font-size: 0.8rem;
      color: var(--muted);
      margin-bottom: 0.35rem;
      font-weight: 500;
    }
    .field { margin-bottom: 1rem; }
    input, select, textarea {
      width: 100%;
      padding: 0.65rem 0.75rem;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      font-size: 1rem;
    }
    textarea {
      min-height: 88px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.9rem;
      line-height: 1.4;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--accent);
    }
    .row {
      display: grid;
      grid-template-columns: 1.2fr 1fr 1fr;
      gap: 0.85rem;
    }
    .actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 0.5rem;
    }
    button {
      flex: 1;
      padding: 0.75rem 1rem;
      border: none;
      border-radius: 8px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    #startBtn {
      background: var(--accent);
      color: #061018;
    }
    #startBtn:hover:not(:disabled) { background: var(--accent-hover); }
    #stopBtn {
      background: transparent;
      color: var(--danger);
      border: 1px solid var(--danger);
    }
    .badge {
      display: inline-block;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .badge.idle { background: #2a3344; color: var(--muted); }
    .badge.running { background: #1e3a2f; color: var(--ok); }
    .badge.done { background: #1e2a3a; color: var(--accent); }
    .badge.error { background: #3a1e1e; color: var(--danger); }
    .meta {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
      margin: 1rem 0;
    }
    .stat {
      background: var(--bg);
      border-radius: 8px;
      padding: 0.75rem;
      text-align: center;
    }
    .stat strong {
      display: block;
      font-size: 1.35rem;
      margin-bottom: 0.15rem;
    }
    .stat span { font-size: 0.75rem; color: var(--muted); }
    .progress-wrap {
      height: 8px;
      background: var(--bg);
      border-radius: 999px;
      overflow: hidden;
      margin-bottom: 1rem;
    }
    .progress-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, var(--accent), var(--ok));
      transition: width 0.3s ease;
    }
    #logs {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.72rem;
      line-height: 1.45;
      background: var(--bg);
      border-radius: 8px;
      padding: 0.75rem;
      height: 280px;
      overflow-y: auto;
      white-space: pre-wrap;
      color: #b8c4d4;
    }
    .hint { font-size: 0.75rem; color: var(--muted); margin-top: 0.35rem; }
    @media (max-width: 520px) {
      .row, .meta { grid-template-columns: 1fr; }
      .actions { flex-direction: column; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Form Bot</h1>
    <p class="sub">Paste promoter ids, set count per promoter and rate — runs all in one job.</p>

    <form id="jobForm">
      <div class="field">
        <label for="promoters">Promoter IDs</label>
        <textarea id="promoters" name="promoters" placeholder="48,49,53,54,57" required></textarea>
        <p class="hint">Comma-separated numbers (e.g. 48,49,53). Change anytime — not hardcoded. Also accepts Promoter-48.</p>
      </div>
      <div class="row">
        <div class="field">
          <label for="count">Count per promoter</label>
          <input id="count" name="count" type="number" min="1" max="10000" value="1000" required />
        </div>
        <div class="field">
          <label for="perMinuteMin">Min / min</label>
          <input id="perMinuteMin" name="perMinuteMin" type="number" min="1" max="60" value="5" required />
        </div>
        <div class="field">
          <label for="perMinuteMax">Max / min</label>
          <input id="perMinuteMax" name="perMinuteMax" type="number" min="1" max="60" value="14" required />
        </div>
      </div>
      <p class="hint" id="totalHint" style="margin-top:-0.4rem;margin-bottom:1rem;"></p>
      <div class="field">
        <label for="language">Language</label>
        <select id="language" name="language">
          <option value="हिंदी" selected>हिंदी</option>
          <option value="English">English</option>
        </select>
      </div>
      <div class="actions">
        <button type="submit" id="startBtn">Start</button>
        <button type="button" id="stopBtn" disabled>Stop</button>
      </div>
    </form>

    <div class="status-panel">
      <div>
        Status: <span id="badge" class="badge idle">Idle</span>
      </div>
      <div class="meta">
        <div class="stat"><strong id="statCurrent">0</strong><span>Current</span></div>
        <div class="stat"><strong id="statOk">0</strong><span>Success</span></div>
        <div class="stat"><strong id="statFail">0</strong><span>Failed</span></div>
      </div>
      <div class="progress-wrap"><div class="progress-bar" id="progressBar"></div></div>
      <div id="logs">Waiting…</div>
    </div>
  </main>
  <script>
    const form = document.getElementById("jobForm");
    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    const badge = document.getElementById("badge");
    const logsEl = document.getElementById("logs");
    const progressBar = document.getElementById("progressBar");
    const totalHint = document.getElementById("totalHint");

    function parseIds(text) {
      return String(text || "")
        .split(/[\\s,;]+/)
        .map((p) => p.trim())
        .filter(Boolean);
    }

    function updateTotalHint() {
      const n = parseIds(form.promoters.value).length;
      const c = Number(form.count.value) || 0;
      const minR = Number(form.perMinuteMin.value) || 5;
      const maxR = Number(form.perMinuteMax.value) || 14;
      const avg = (minR + maxR) / 2 || 1;
      const total = n * c;
      const mins = total ? Math.ceil(total / avg) : 0;
      const hours = (mins / 60).toFixed(1);
      totalHint.textContent = n
        ? "Total: " + total + " forms · shuffled · random " + minR + "–" + maxR + "/min · ~" + hours + " hours"
        : "Paste promoter ids above";
    }

    async function loadDefaults() {
      const res = await fetch("/api/defaults");
      const d = await res.json();
      if (d.promoters) form.promoters.value = Array.isArray(d.promoters) ? d.promoters.join(",") : d.promoters;
      else if (d.promoter) form.promoters.value = d.promoter;
      if (d.count) form.count.value = d.count;
      if (d.perMinuteMin) form.perMinuteMin.value = d.perMinuteMin;
      else if (d.perMinute) form.perMinuteMin.value = d.perMinute;
      if (d.perMinuteMax) form.perMinuteMax.value = d.perMinuteMax;
      else if (d.perMinute) form.perMinuteMax.value = d.perMinute;
      if (d.language) form.language.value = d.language;
      updateTotalHint();
    }

    function setBadge(state) {
      badge.className = "badge " + state;
      badge.textContent = state === "running" ? "Running" : state === "error" ? "Error" : state === "done" ? "Done" : "Idle";
    }

    function render(status) {
      const running = status.running;
      startBtn.disabled = running;
      stopBtn.disabled = !running;
      form.promoters.disabled = running;
      form.count.disabled = running;
      form.perMinuteMin.disabled = running;
      form.perMinuteMax.disabled = running;
      form.language.disabled = running;

      if (running) setBadge("running");
      else if (status.error) setBadge("error");
      else if (status.finishedAt) setBadge("done");
      else setBadge("idle");

      document.getElementById("statCurrent").textContent =
        status.total ? status.current + "/" + status.total : "0";
      document.getElementById("statOk").textContent = status.succeeded || 0;
      document.getElementById("statFail").textContent = status.failed || 0;

      const pct = status.total ? Math.round((status.current / status.total) * 100) : 0;
      progressBar.style.width = pct + "%";

      logsEl.textContent = (status.logs && status.logs.length)
        ? status.logs.join("\\n")
        : "Waiting…";
      logsEl.scrollTop = logsEl.scrollHeight;
    }

    async function poll() {
      try {
        const res = await fetch("/api/status");
        render(await res.json());
      } catch (e) {
        /* ignore transient errors */
      }
    }

    form.promoters.addEventListener("input", updateTotalHint);
    form.count.addEventListener("input", updateTotalHint);
    form.perMinuteMin.addEventListener("input", updateTotalHint);
    form.perMinuteMax.addEventListener("input", updateTotalHint);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      startBtn.disabled = true;
      const payload = {
        promoters: form.promoters.value.trim(),
        count: Number(form.count.value),
        perMinuteMin: Number(form.perMinuteMin.value),
        perMinuteMax: Number(form.perMinuteMax.value),
        language: form.language.value,
      };
      const res = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to start");
        startBtn.disabled = false;
        return;
      }
      await poll();
    });

    stopBtn.addEventListener("click", async () => {
      await fetch("/api/stop", { method: "POST" });
      await poll();
    });

    loadDefaults().then(poll);
    setInterval(poll, 2000);
  </script>
</body>
</html>
`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(HTML);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      sendJson(res, 200, getStatus());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/defaults") {
      sendJson(res, 200, loadDefaults());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/start") {
      const body = await readJsonBody(req);
      try {
        await startJob(body);
        sendJson(res, 200, { ok: true, status: getStatus() });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/stop") {
      if (job.running) {
        job.stopRequested = true;
        pushLog("Stop requested…");
      }
      sendJson(res, 200, { ok: true, status: getStatus() });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Form Bot UI listening on http://0.0.0.0:${PORT}`);
});
