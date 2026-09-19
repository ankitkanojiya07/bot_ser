import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { runBatch, parsePromoterTargets, DEFAULT_FORM_URL } from "./fill-form.js";

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
  campaignProgress: [],
};

function pushLog(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  job.logs.push(line);
  if (job.logs.length > 2000) job.logs.shift();
  console.log(line);
}

function formShortName(url) {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop();
    return last || parsed.host;
  } catch {
    return url;
  }
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
    campaignProgress: job.campaignProgress,
  };
}

function normalizeFormUrl(input) {
  const url = String(input || "").trim() || DEFAULT_FORM_URL;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Form URL must be a valid http(s) link");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Form URL must start with http:// or https://");
  }
  return parsed.href;
}

function parseCampaigns(input) {
  const items =
    Array.isArray(input.campaigns) && input.campaigns.length > 0
      ? input.campaigns
      : [
          {
            formUrl: input.formUrl,
            promoters: input.promoters ?? input.promoter,
          },
        ];
  const fallbackCount = Number(input.count);

  return items.map((item, index) => {
    const formUrl = normalizeFormUrl(item?.formUrl);
    let promoters;
    try {
      promoters = parsePromoterTargets(
        item?.promoters ?? item?.promoter ?? "",
        Number.isFinite(fallbackCount) && fallbackCount >= 1
          ? fallbackCount
          : undefined,
      );
    } catch (error) {
      throw new Error(`Form ${index + 1}: ${error.message}`);
    }
    if (promoters.length === 0) {
      throw new Error(`Form ${index + 1}: enter at least one promoter id and count`);
    }
    return { formUrl, promoters };
  });
}

async function getNetworkStatus() {
  const url =
    job.config?.campaigns?.[0]?.formUrl || job.config?.formUrl || DEFAULT_FORM_URL;
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? "online" : `unhealthy (${response.status})`;
  } catch (error) {
    return error.name === "TimeoutError" ? "timeout" : "offline";
  }
}

async function getProgressText() {
  const network = await getNetworkStatus();
  return (
    [
      `Progress: ${job.current}/${job.total}`,
      `Success: ${job.succeeded}`,
      `Failed: ${job.failed}`,
      `Running: ${job.running ? "yes" : "no"}`,
      `Network: ${network}`,
    ].join("\n") + "\n"
  );
}

function loadDefaults() {
  const defaults = {
    formUrl: DEFAULT_FORM_URL,
    language: "हिंदी",
    promoters: "",
    count: 1000,
    perMinuteMin: 5,
    perMinuteMax: 14,
    campaigns: [{ formUrl: DEFAULT_FORM_URL, promoters: [{ id: "", count: "" }] }],
  };
  if (existsSync(DATA_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(DATA_FILE, "utf8"));
      const merged = { ...defaults, ...saved };
      if (!Array.isArray(saved.campaigns) || saved.campaigns.length === 0) {
        merged.campaigns = [
          {
            formUrl: saved.formUrl || DEFAULT_FORM_URL,
            promoters: saved.promoters || saved.promoter || "",
          },
        ];
      }
      return merged;
    } catch {
      /* ignore */
    }
  }
  return defaults;
}

async function startJob(input) {
  if (job.running) {
    throw new Error("A job is already running");
  }

  const campaigns = parseCampaigns(input);
  const perMinuteMin = Number(input.perMinuteMin ?? input.perMinute ?? 5);
  const perMinuteMax = Number(input.perMinuteMax ?? input.perMinute ?? 14);
  const language = String(input.language || "हिंदी").trim();

  if (
    !Number.isFinite(perMinuteMin) ||
    !Number.isFinite(perMinuteMax) ||
    perMinuteMin < 1 ||
    perMinuteMax > 60 ||
    perMinuteMin > perMinuteMax
  ) {
    throw new Error("Per-minute range must be 1–60 with min ≤ max");
  }

  const campaignTotal = (campaign) =>
    campaign.promoters.reduce((sum, item) => sum + item.count, 0);
  const total = campaigns.reduce((sum, campaign) => sum + campaignTotal(campaign), 0);
  const avgRate = campaigns.reduce(
    (sum, campaign) =>
      sum + ((perMinuteMin + perMinuteMax) / 2) * campaign.promoters.length,
    0,
  );
  const estimatedMinutes = Math.ceil(total / Math.max(avgRate, 1));
  const config = {
    campaigns,
    formUrl: campaigns[0].formUrl,
    language,
    promoters: campaigns[0].promoters,
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
  job.campaignProgress = campaigns.map((campaign, index) => ({
    index,
    formUrl: campaign.formUrl,
    name: formShortName(campaign.formUrl),
    promoters: campaign.promoters,
    promoterSummary: campaign.promoters
      .map((item) => `${String(item.promoter).replace(/^Promoter-/i, "")}×${item.count}`)
      .join(", "),
    total: campaignTotal(campaign),
    current: 0,
    succeeded: 0,
    failed: 0,
    status: "queued",
  }));

  pushLog(
    `Job queued: ${campaigns.length} form(s) in parallel, ${total} total submissions (~${estimatedMinutes} min)`,
  );
  campaigns.forEach((campaign, index) => {
    pushLog(
      `Form ${index + 1}: ${campaign.formUrl} | ${campaign.promoters
        .map((item) => `${item.promoter}×${item.count}`)
        .join(", ")} | ${campaignTotal(campaign)} forms`,
    );
  });

  // Run in background
  setImmediate(async () => {
    const resultsByCampaign = campaigns.map(() => []);

    const refreshTotals = () => {
      job.current = job.campaignProgress.reduce((sum, item) => sum + (item.current || 0), 0);
      job.succeeded = job.campaignProgress.reduce(
        (sum, item) => sum + (item.succeeded || 0),
        0,
      );
      job.failed = job.campaignProgress.reduce((sum, item) => sum + (item.failed || 0), 0);
      job.results = resultsByCampaign.flat();
    };

    try {
      await Promise.all(
        campaigns.map(async (campaign, i) => {
          if (job.stopRequested) {
            job.campaignProgress[i].status = "stopped";
            return;
          }
          job.campaignProgress[i].status = "running";
          pushLog(
            `Starting form ${i + 1}/${campaigns.length} in parallel: ${campaign.formUrl} (${campaignTotal(campaign)} submissions)`,
          );
          try {
            const summary = await runBatch(
              {
                formUrl: campaign.formUrl,
                language,
                promoters: campaign.promoters,
                perMinuteMin,
                perMinuteMax,
                random: true,
              },
              {
                headless: true,
                shouldStop: () => job.stopRequested,
                onLog: (msg) => pushLog(String(msg).trimEnd()),
                onProgress: ({ current, results }) => {
                  resultsByCampaign[i] = results;
                  job.campaignProgress[i].current = current;
                  job.campaignProgress[i].succeeded = results.filter(
                    (r) => r.status === "success",
                  ).length;
                  job.campaignProgress[i].failed = results.filter(
                    (r) => r.status === "failed",
                  ).length;
                  refreshTotals();
                },
              },
            );
            resultsByCampaign[i] = summary.results;
            job.campaignProgress[i].current = summary.total;
            job.campaignProgress[i].succeeded = summary.succeeded;
            job.campaignProgress[i].failed = summary.failed;
            job.campaignProgress[i].status = job.stopRequested ? "stopped" : "done";
            refreshTotals();
            pushLog(
              `Form ${i + 1}/${campaigns.length} (${formShortName(campaign.formUrl)}) finished: success ${summary.succeeded} | failed ${summary.failed}.`,
            );
          } catch (error) {
            if (error.message === "Stopped by user") {
              job.campaignProgress[i].status = "stopped";
              pushLog(
                `Form ${i + 1}/${campaigns.length} stopped: ${error.message}`,
              );
              return;
            }
            job.campaignProgress[i].status = "error";
            pushLog(
              `Form ${i + 1}/${campaigns.length} (${formShortName(campaign.formUrl)}) failed: ${error.message}. Other forms keep running.`,
            );
            refreshTotals();
          }
        }),
      );
    } catch (error) {
      job.error = error.message;
      pushLog(`Fatal: ${error.message}`);
    } finally {
      job.running = false;
      job.finishedAt = new Date().toISOString();
      job.campaignProgress.forEach((item) => {
        if (item.status === "queued" || item.status === "running") {
          item.status = job.stopRequested ? "stopped" : item.status;
        }
      });
      refreshTotals();
      pushLog("All forms finished.");
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
      max-width: 760px;
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
      grid-template-columns: 1fr 1fr;
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
    #campaignStatus {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      margin: 0 0 1rem;
    }
    .c-stat {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      align-items: center;
      background: var(--bg);
      border-radius: 8px;
      padding: 0.55rem 0.75rem;
      font-size: 0.8rem;
    }
    .c-stat .c-name { color: var(--text); font-weight: 600; }
    .c-stat .c-meta { color: var(--muted); }
    .c-stat.queued .c-state { color: var(--muted); }
    .c-stat.running .c-state { color: var(--accent); }
    .c-stat.done .c-state { color: var(--ok); }
    .c-stat.error .c-state, .c-stat.stopped .c-state { color: var(--danger); }
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
    .campaigns { display: flex; flex-direction: column; gap: 0.85rem; margin-bottom: 0.85rem; }
    .campaign {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1rem 1rem 0.35rem;
      background: var(--bg);
    }
    .campaign-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }
    .campaign-title { font-size: 0.8rem; color: var(--muted); font-weight: 600; }
    .remove-campaign {
      flex: none;
      width: auto;
      padding: 0.3rem 0.65rem;
      font-size: 0.75rem;
      background: transparent;
      color: var(--danger);
      border: 1px solid var(--danger);
    }
    #addCampaign {
      background: transparent;
      color: var(--accent);
      border: 1px dashed var(--border);
      margin-bottom: 1rem;
      width: 100%;
    }
    .promoter-head, .promoter-row {
      display: grid;
      grid-template-columns: 1fr 110px 78px;
      gap: 0.5rem;
      align-items: center;
    }
    .promoter-head {
      margin-bottom: 0.35rem;
      font-size: 0.72rem;
      color: var(--muted);
      font-weight: 600;
    }
    .promoter-row { margin-bottom: 0.45rem; }
    .promoter-row .remove-promoter,
    .add-promoter {
      flex: none;
      width: auto;
      padding: 0.45rem 0.65rem;
      font-size: 0.75rem;
    }
    .promoter-row .remove-promoter {
      background: transparent;
      color: var(--danger);
      border: 1px solid var(--danger);
    }
    .add-promoter {
      background: transparent;
      color: var(--accent);
      border: 1px dashed var(--border);
      width: 100%;
      margin: 0.15rem 0 0.35rem;
    }
    @media (max-width: 520px) {
      .row, .meta { grid-template-columns: 1fr; }
      .actions { flex-direction: column; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Form Bot</h1>
    <p class="sub">Add one or more form links. Each promoter ID has its own completion count. All links run at the same time.</p>

    <form id="jobForm">
      <div id="campaigns" class="campaigns"></div>
      <button type="button" id="addCampaign">+ Add another form</button>
      <p class="hint" style="margin-top:-0.6rem;margin-bottom:1rem;">Every form starts together. Simultaneous browsers = number of promoter IDs × max per minute, added across all forms.</p>
      <div class="row">
        <div class="field">
          <label for="perMinuteMin">Min per promoter / min</label>
          <input id="perMinuteMin" name="perMinuteMin" type="number" min="1" max="60" value="5" required />
        </div>
        <div class="field">
          <label for="perMinuteMax">Max per promoter / min</label>
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
      <div id="campaignStatus"></div>
      <div id="logs">Waiting…</div>
    </div>
  </main>
  <script>
    const form = document.getElementById("jobForm");
    const campaignsEl = document.getElementById("campaigns");
    const addCampaignBtn = document.getElementById("addCampaign");
    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    const badge = document.getElementById("badge");
    const logsEl = document.getElementById("logs");
    const progressBar = document.getElementById("progressBar");
    const campaignStatusEl = document.getElementById("campaignStatus");
    const totalHint = document.getElementById("totalHint");

    function parseIds(text) {
      return String(text || "")
        .split(/[\\s,;]+/)
        .map((p) => p.trim())
        .filter(Boolean);
    }

    function promoterIdDisplay(value) {
      return String(value || "").replace(/^promoter-/i, "");
    }

    function normalizePromoterRows(promoters, fallbackCount) {
      if (Array.isArray(promoters) && promoters.length && typeof promoters[0] === "object") {
        return promoters.map(function (p) {
          return {
            id: promoterIdDisplay(p.id || p.promoter || ""),
            count: p.count || fallbackCount || "",
          };
        });
      }
      const text = Array.isArray(promoters) ? promoters.join(",") : String(promoters || "");
      const ids = parseIds(text).map(promoterIdDisplay);
      if (!ids.length) return [{ id: "", count: fallbackCount || "" }];
      return ids.map(function (id) {
        return { id: id, count: fallbackCount || "" };
      });
    }

    function updateCampaignTitles() {
      campaignsEl.querySelectorAll(".campaign").forEach(function (row, index) {
        row.querySelector(".campaign-title").textContent = "Form " + (index + 1);
        row.querySelector(".remove-campaign").disabled =
          campaignsEl.querySelectorAll(".campaign").length <= 1;
      });
    }

    function collectCampaigns() {
      return Array.from(campaignsEl.querySelectorAll(".campaign")).map(function (row) {
        const promoters = Array.from(row.querySelectorAll(".promoter-row")).map(function (item) {
          return {
            id: item.querySelector(".c-pid").value.trim(),
            count: Number(item.querySelector(".c-pcount").value),
          };
        }).filter(function (item) { return item.id; });
        return {
          formUrl: row.querySelector(".c-url").value.trim(),
          promoters: promoters,
        };
      });
    }

    function addPromoterRow(listEl, id, count) {
      const row = document.createElement("div");
      row.className = "promoter-row";
      row.innerHTML =
        '<input class="c-pid" placeholder="ID, e.g. 21" required />' +
        '<input class="c-pcount" type="number" min="1" max="10000" placeholder="Count" required />' +
        '<button type="button" class="remove-promoter">Remove</button>';
      row.querySelector(".c-pid").value = id || "";
      row.querySelector(".c-pcount").value = count || "";
      row.querySelector(".remove-promoter").addEventListener("click", function () {
        const rows = listEl.querySelectorAll(".promoter-row");
        if (rows.length <= 1) return;
        row.remove();
        updateTotalHint();
      });
      row.querySelector(".c-pid").addEventListener("input", updateTotalHint);
      row.querySelector(".c-pcount").addEventListener("input", updateTotalHint);
      listEl.appendChild(row);
      updateTotalHint();
    }

    function addCampaignRow(url, promoters, fallbackCount) {
      const wrap = document.createElement("div");
      wrap.className = "campaign";
      wrap.innerHTML =
        '<div class="campaign-head">' +
          '<span class="campaign-title">Form</span>' +
          '<button type="button" class="remove-campaign">Remove</button>' +
        "</div>" +
        '<div class="field">' +
          '<label>Form URL</label>' +
          '<input class="c-url" type="url" placeholder="https://seeedemaseekhelp.com/Weekend_Activity_6/" required />' +
        "</div>" +
        '<div class="field">' +
          '<label>Promoters for this form</label>' +
          '<div class="promoter-head"><span>Promoter ID</span><span>Completions</span><span></span></div>' +
          '<div class="promoter-list"></div>' +
          '<button type="button" class="add-promoter">+ Add promoter</button>' +
          '<p class="hint">Each ID has its own count. Example: 21 → 10, 22 → 25, 23 → 21.</p>' +
        "</div>";
      wrap.querySelector(".c-url").value = url || "";
      const listEl = wrap.querySelector(".promoter-list");
      normalizePromoterRows(promoters, fallbackCount).forEach(function (item) {
        addPromoterRow(listEl, item.id, item.count);
      });
      wrap.querySelector(".add-promoter").addEventListener("click", function () {
        addPromoterRow(listEl, "", "");
      });
      wrap.querySelector(".remove-campaign").addEventListener("click", function () {
        if (campaignsEl.querySelectorAll(".campaign").length <= 1) return;
        wrap.remove();
        updateCampaignTitles();
        updateTotalHint();
      });
      wrap.querySelector(".c-url").addEventListener("input", updateTotalHint);
      campaignsEl.appendChild(wrap);
      updateCampaignTitles();
      updateTotalHint();
    }

    function updateTotalHint() {
      const campaigns = collectCampaigns();
      const maxR = Number(form.perMinuteMax.value) || 14;
      let total = 0;
      let peak = 0;
      campaigns.forEach(function (campaign) {
        campaign.promoters.forEach(function (item) {
          total += Number(item.count) || 0;
        });
        peak += campaign.promoters.length * maxR;
      });
      const formCount = campaigns.length;
      totalHint.textContent = total
        ? formCount + " form(s) in parallel · " + total + " submissions · ~" + peak + " simultaneous browsers (no cap)"
        : "Add a form URL, then each promoter ID and how many completions it needs";
    }

    async function loadDefaults() {
      const [defaultsRes, statusRes] = await Promise.all([
        fetch("/api/defaults"),
        fetch("/api/status"),
      ]);
      const d = await defaultsRes.json();
      const status = await statusRes.json();
      campaignsEl.innerHTML = "";
      const fromJob = status.config && status.config.campaigns && status.config.campaigns.length
        ? status.config.campaigns
        : null;
      const rows = fromJob || (Array.isArray(d.campaigns) && d.campaigns.length
        ? d.campaigns
        : [{ formUrl: d.formUrl || "", promoters: d.promoters || d.promoter || "" }]);
      const fallbackCount = (status.config && status.config.count) || d.count || "";
      rows.forEach(function (row) {
        addCampaignRow(row.formUrl, row.promoters, fallbackCount);
      });
      const cfg = status.config || d;
      if (cfg.perMinuteMin) form.perMinuteMin.value = cfg.perMinuteMin;
      else if (d.perMinuteMin) form.perMinuteMin.value = d.perMinuteMin;
      else if (d.perMinute) form.perMinuteMin.value = d.perMinute;
      if (cfg.perMinuteMax) form.perMinuteMax.value = cfg.perMinuteMax;
      else if (d.perMinuteMax) form.perMinuteMax.value = d.perMinuteMax;
      else if (d.perMinute) form.perMinuteMax.value = d.perMinute;
      if (cfg.language) form.language.value = cfg.language;
      else if (d.language) form.language.value = d.language;
      updateTotalHint();
    }

    function setBadge(state) {
      badge.className = "badge " + state;
      badge.textContent = state === "running" ? "Running" : state === "error" ? "Error" : state === "done" ? "Done" : "Idle";
    }

    function setFormDisabled(running) {
      form.perMinuteMin.disabled = running;
      form.perMinuteMax.disabled = running;
      form.language.disabled = running;
      addCampaignBtn.disabled = running;
      campaignsEl.querySelectorAll(".c-url, .c-pid, .c-pcount, .remove-campaign, .remove-promoter, .add-promoter").forEach(function (el) {
        el.disabled = running;
      });
    }

    function render(status) {
      const running = status.running;
      startBtn.disabled = running;
      stopBtn.disabled = !running;
      setFormDisabled(running);

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

      const campaigns = status.campaignProgress || [];
      campaignStatusEl.innerHTML = campaigns.map(function (c) {
        const state = c.status || "queued";
        const label = state === "running" ? "running" : state === "done" ? "done" : state === "error" ? "error" : state === "stopped" ? "stopped" : "waiting";
        return '<div class="c-stat ' + state + '">' +
          '<span class="c-name">Form ' + (c.index + 1) + ': ' + (c.name || c.formUrl) + '</span>' +
          '<span class="c-meta">' + (c.current || 0) + '/' + (c.total || 0) + (c.promoterSummary ? ' · ' + c.promoterSummary : '') + '</span>' +
          '<span class="c-state">' + label + '</span>' +
        '</div>';
      }).join("");

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

    addCampaignBtn.addEventListener("click", function () {
      addCampaignRow("", "");
    });
    form.perMinuteMin.addEventListener("input", updateTotalHint);
    form.perMinuteMax.addEventListener("input", updateTotalHint);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      startBtn.disabled = true;
      const payload = {
        campaigns: collectCampaigns(),
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

    if (req.method === "GET" && url.pathname === "/api/progress") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(await getProgressText());
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
