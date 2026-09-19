import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join, resolve } from "path";
import {
  generateRandomIndianName,
  generateRandomAnswers,
  pickWeightedGender,
} from "./random-data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FORM_URL =
  "https://seeedemaseekhelp.com/Weekend_Activity_5/";
const DATA_FILE = join(__dirname, "form-data.json");

const LANGUAGES = {
  English: "3",
  অসমীয়া: "1",
  বাঙ্গালি: "2",
  ગુજરાતી: "4",
  हिंदी: "5",
  ಕನ್ನಡ: "6",
  മലയാളം: "7",
  मराठी: "8",
  ଓଡ଼ିଆ: "9",
  ਪੰਜਾਬੀ: "10",
  தமிழ்: "11",
  తెలుగు: "12",
};

const LANGUAGE_FORMS = {
  3: {
    age: { "< 50 years": "21-0-0", "> 50 years": "21-1-1" },
    gender: { Female: "22-0-1", Others: "22-1-1", Male: "22-2-1" },
    yesNo: {
      qst_2: "23",
      qst_3: "24",
      qst_4: "25",
      qst_5: "26",
      qst_6: "27",
      qst_7: "28",
      qst_8: "29",
    },
    clinicalConditions: {
      Diabetes: "30-0-1",
      "High Blood pressure": "30-1-1",
      "High Cholesterol": "30-2-1",
      Anaemic: "30-3-1",
    },
    disorders: {
      "Liver disease": "121-0-1",
      "Kidney disease": "121-1-1",
      "Endocrine disease  (e.g.Thyroid disease)": "121-2-1",
    },
  },
  5: {
    age: { "< 50 years": "41-1-0", "> 50 years": "41-0-1" },
    gender: { Male: "42-0-1", Female: "42-1-1", Others: "42-2-1" },
    yesNo: {
      qst_2: "43",
      qst_3: "44",
      qst_4: "45",
      qst_5: "46",
      qst_6: "47",
      qst_7: "48",
      qst_8: "49",
    },
    clinicalConditions: {
      Diabetes: "50-0-1",
      "High Blood pressure": "50-1-1",
      "High Cholesterol": "50-2-1",
      Anaemic: "50-3-1",
    },
    disorders: {
      "Liver disease": "122-0-1",
      "Kidney disease": "122-1-1",
      "Endocrine disease  (e.g.Thyroid disease)": "122-2-1",
    },
  },
};

const RADIO_FIELDS = [
  ["qst_0", "age"],
  ["qst_1", "gender"],
  ["qst_2", "swellingBothLegs"],
  ["qst_3", "swellingWorseEvening"],
  ["qst_4", "swellingAllOverBody"],
  ["qst_5", "swellingFaceMorning"],
  ["qst_6", "breathingDifficulty"],
  ["qst_7", "breathingDifficultyLying"],
  ["qst_8", "breathingDifficultyWalking"],
];

const YES_NO = { Yes: "1", No: "0" };

function loadConfig() {
  if (!existsSync(DATA_FILE)) {
    throw new Error(
      `Missing ${DATA_FILE}. Copy form-data.example.json to form-data.json and edit your values.`,
    );
  }
  return JSON.parse(readFileSync(DATA_FILE, "utf8"));
}

function buildRunData(config) {
  if (config.random !== false) {
    const gender = pickWeightedGender();
    return {
      ...config,
      fullName: generateRandomIndianName(gender),
      answers: generateRandomAnswers(gender),
    };
  }
  return config;
}

function getRunCount(config) {
  const fromEnv = Number(process.env.COUNT);
  if (!Number.isNaN(fromEnv) && fromEnv > 0) return fromEnv;
  return config.count ?? 1;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const MAX_RETRIES = 3;
/** Keep each Chromium process small so a GPU/renderer crash cannot wipe a whole batch. */
const PAGES_PER_BROWSER = 6;
const CHROMIUM_ARGS = [
  "--disable-gpu",
  "--disable-gpu-compositing",
  "--disable-software-rasterizer",
  "--disable-dev-shm-usage",
  "--mute-audio",
];

function shortError(error) {
  const raw = String(error?.message || error);
  if (
    /page crashed|has been closed|target closed|browser has been closed/i.test(
      raw,
    )
  ) {
    return "Chromium crashed (will relaunch)";
  }
  const withoutDump = raw.split("Browser logs:")[0].split("Call log:")[0].trim();
  return (withoutDump.split("\n")[0].trim() || withoutDump).slice(0, 240);
}

function isBrowserDeadError(error) {
  return /page crashed|has been closed|target closed|browser has been closed/i.test(
    String(error?.message || error),
  );
}

async function launchChromium(headless) {
  return chromium.launch({
    headless,
    args: CHROMIUM_ARGS,
    ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
  });
}

function createBrowserPool({ headless, size, onLog }) {
  const slots = Array.from({ length: Math.max(1, size) }, (_, slotIndex) => {
    let browser = null;
    let launching = null;

    const ensure = async () => {
      if (browser?.isConnected()) return browser;
      if (launching) return launching;
      launching = launchChromium(headless)
        .then((instance) => {
          browser = instance;
          instance.on("disconnected", () => {
            if (browser === instance) browser = null;
          });
          return instance;
        })
        .catch((error) => {
          browser = null;
          throw error;
        })
        .finally(() => {
          launching = null;
        });
      return launching;
    };

    const close = async () => {
      const instance = browser;
      browser = null;
      await instance?.close().catch(() => {});
    };

    return { slotIndex, ensure, close };
  });

  return {
    size: slots.length,
    async withPage(jobIndex, fn) {
      const slot = slots[jobIndex % slots.length];
      const browser = await slot.ensure();
      let page;
      try {
        page = await browser.newPage();
        return await fn(page);
      } catch (error) {
        if (isBrowserDeadError(error)) {
          onLog?.(
            `Chromium ${slot.slotIndex + 1}/${slots.length} died — relaunching for retries`,
          );
          await slot.close();
        }
        throw error;
      } finally {
        await page?.close().catch(() => {});
      }
    },
    async close() {
      await Promise.all(slots.map((slot) => slot.close()));
    },
  };
}

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Random forms started per promoter in each simultaneous minute-long batch. */
function getPerMinuteRange(config) {
  const envMin = Number(process.env.PER_MINUTE_MIN);
  const envMax = Number(process.env.PER_MINUTE_MAX);
  let min = Number(config.perMinuteMin ?? config.perMinute ?? 5);
  let max = Number(config.perMinuteMax ?? config.perMinute ?? 14);

  if (!Number.isNaN(envMin) && envMin > 0) min = envMin;
  if (!Number.isNaN(envMax) && envMax > 0) max = envMax;

  min = Math.max(1, Math.min(60, Math.floor(min)));
  max = Math.max(1, Math.min(60, Math.floor(max)));
  if (min > max) [min, max] = [max, min];
  return { min, max };
}

/** Accept "48", "Promoter-48", comma/newline lists. Returns unique Promoter-N values. */
export function parsePromoters(input) {
  const raw = Array.isArray(input) ? input.join(",") : String(input ?? "");
  const parts = raw
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const promoters = [];
  const seen = new Set();
  for (const part of parts) {
    const match = part.match(/^(?:promoter-)?(\d+)$/i);
    const value = match ? `Promoter-${match[1]}` : part;
    if (seen.has(value)) continue;
    seen.add(value);
    promoters.push(value);
  }
  return promoters;
}

function normalizePromoterId(raw) {
  const ids = parsePromoters(raw);
  return ids[0] || "";
}

/**
 * Per-promoter completion targets.
 * Accepts:
 *   [{ id: "21", count: 10 }, { promoter: "Promoter-22", count: 25 }]
 *   ["21", "22"] + fallbackCount
 *   "21,22,23" + fallbackCount
 *   "21:10, 22:25" or newline pairs
 */
export function parsePromoterTargets(input, fallbackCount) {
  const targets = [];
  const seen = new Set();

  const push = (rawId, rawCount) => {
    const promoter = normalizePromoterId(rawId);
    if (!promoter) return;
    const count = Number(rawCount);
    if (!Number.isFinite(count) || count < 1 || count > 10000) {
      throw new Error(`Count for ${promoter} must be between 1 and 10000`);
    }
    if (seen.has(promoter)) return;
    seen.add(promoter);
    targets.push({ promoter, count: Math.floor(count) });
  };

  if (Array.isArray(input)) {
    for (const entry of input) {
      if (entry && typeof entry === "object") {
        push(entry.id ?? entry.promoter ?? "", entry.count ?? fallbackCount);
      } else {
        push(entry, fallbackCount);
      }
    }
    return targets;
  }

  const raw = String(input ?? "").trim();
  if (!raw) return targets;

  const parts = raw
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const hasExplicitCounts = parts.some((part) => part.includes(":"));
  if (hasExplicitCounts) {
    for (const part of parts) {
      const colon = part.lastIndexOf(":");
      const idPart = colon === -1 ? part : part.slice(0, colon).trim();
      const countPart = colon === -1 ? fallbackCount : part.slice(colon + 1).trim();
      push(idPart, countPart);
    }
    return targets;
  }

  for (const promoter of parsePromoters(raw)) {
    push(promoter, fallbackCount);
  }
  return targets;
}

function resolvePromoters(config) {
  const fallbackCount = getRunCount(config);
  const targets = parsePromoterTargets(
    config.promoters ?? config.promoter ?? "",
    fallbackCount,
  );
  if (targets.length === 0) {
    throw new Error(
      "At least one promoter is required (e.g. 48,49,53 or Promoter-3)",
    );
  }
  shuffleInPlace(targets);
  return { targets };
}

/** Keep the next simultaneous batch at least one minute after the prior one started. */
async function waitForNextBatch(batchStartedAt, { shouldStop, onLog } = {}) {
  const waitMs = 60_000 - (Date.now() - batchStartedAt);
  if (waitMs <= 0) return;
  if (shouldStop?.()) throw new Error("Stopped by user");

  const msg = `Batch complete — waiting ${Math.ceil(waitMs / 1000)}s before the next simultaneous batch...`;
  onLog?.(msg);
  console.log(msg);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

function getLanguageId(data) {
  return LANGUAGES[data.language] ?? data.language;
}

function getFormConfig(languageId) {
  const config = LANGUAGE_FORMS[languageId];
  if (!config) {
    throw new Error(
      `Form values for language id "${languageId}" are not configured yet.`,
    );
  }
  return config;
}

function resolveRadioValue(formConfig, fieldName, answerKey, answer) {
  if (fieldName === "qst_0") return formConfig.age[answer];
  if (fieldName === "qst_1") return formConfig.gender[answer];
  const prefix = formConfig.yesNo[fieldName];
  return `${prefix}-${YES_NO[answer]}`;
}

function radioPredicate(fieldName, answer) {
  if (fieldName === "qst_0") {
    const wantUnder = String(answer).includes("<");
    return (label) =>
      wantUnder ? /<\s*50/.test(label) : />\s*50/.test(label);
  }
  if (fieldName === "qst_1") {
    if (answer === "Male") return (label) => /male|पुरु/i.test(label);
    if (answer === "Female") return (label) => /female|महिला/i.test(label);
    return (label) => /other|अन्य/i.test(label);
  }
  if (answer === "Yes") return (label) => /yes|हां|हाँ/i.test(label);
  return (label) => /no|नहीं|नही/i.test(label);
}

async function optionLabel(radio) {
  return radio.evaluate((el) => {
    const next = el.nextElementSibling;
    if (next && next.tagName === "LABEL") return (next.textContent || "").trim();
    if (el.id) {
      const lab = document.querySelector(`label[for="${el.id}"]`);
      if (lab) return (lab.textContent || "").trim();
    }
    return "";
  });
}

async function checkMatchingRadio(page, name, answer, fallbackValue) {
  const radios = page.locator(`input[name="${name}"]`);
  await radios.first().waitFor({ timeout: 15000 });
  const count = await radios.count();
  const predicate = radioPredicate(name, answer);
  const seen = [];

  for (let i = 0; i < count; i += 1) {
    const radio = radios.nth(i);
    const value = (await radio.getAttribute("value")) || "";
    const label = await optionLabel(radio);
    seen.push(`${label || "(no label)"}=${value}`);
    if (predicate(label) || (fallbackValue && value === fallbackValue)) {
      await radio.check({ force: true });
      return;
    }
  }

  throw new Error(`No matching option for ${name}="${answer}" among: ${seen.join("; ")}`);
}

async function fillStep1(page, data) {
  const languageValue = getLanguageId(data);
  await page.selectOption('select[name="language"]', languageValue);
  await page.locator("#checkbox").check();
  await page.locator("#submit").click();
  await page.waitForSelector('input[name="name"]', { timeout: 15000 });
}

async function fillStep2(page, data) {
  const formConfig = getFormConfig(getLanguageId(data));
  const { answers } = data;

  await page.fill('input[name="name"]', data.fullName);
  await page.selectOption('select[name="promoter"]', data.promoter);
  await page.locator('input[name="qst_0"]').first().waitFor({ timeout: 15000 });

  for (const [fieldName, answerKey] of RADIO_FIELDS) {
    const answer = answers[answerKey];
    const fallbackValue = resolveRadioValue(
      formConfig,
      fieldName,
      answerKey,
      answer,
    );
    await checkMatchingRadio(page, fieldName, answer, fallbackValue);
  }

  for (const condition of answers.clinicalConditions ?? []) {
    const value = formConfig.clinicalConditions[condition];
    if (!value) throw new Error(`Unknown clinical condition: ${condition}`);
    await page
      .locator(`input[name="qst_9[]"][value="${value}"]`)
      .check({ force: true });
  }

  for (const disorder of answers.disorders ?? []) {
    const value = formConfig.disorders[disorder];
    if (!value) throw new Error(`Unknown disorder: ${disorder}`);
    await page
      .locator(`input[name="qst_10[]"][value="${value}"]`)
      .check({ force: true });
  }

  await page.locator("#checkbox").check();
  await page.locator("#submit").click();
  await page.waitForSelector('a[href*="report_view"]', { timeout: 15000 });
}

function resolveFormUrl(data) {
  const url = String(data?.formUrl || DEFAULT_FORM_URL).trim();
  if (!url) return DEFAULT_FORM_URL;
  return url;
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

async function fillForm(page, data, { isFirstRun }) {
  if (isFirstRun) {
    await page.goto(resolveFormUrl(data), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
  }

  await fillStep1(page, data);
  await fillStep2(page, data);
}

/**
 * Run a batch of form submissions.
 * @param {object} config - { formUrl?, language, promoter|promoters (ids or [{id,count}]), count (fallback), perMinuteMin, perMinuteMax, random? }
 * @param {object} options - { headless?, onLog?, onProgress?, shouldStop? }
 */
export async function runBatch(config, options = {}) {
  const {
    headless = process.env.HEADLESS === "true",
    onLog = () => {},
    onProgress = () => {},
    shouldStop = () => false,
  } = options;

  const { targets } = resolvePromoters(config);
  const promoters = targets.map((target) => target.promoter);
  const runCount = targets.reduce((sum, target) => sum + target.count, 0);
  const { min: minPerMin, max: maxPerMin } = getPerMinuteRange(config);
  const avgPerPromoterRate = (minPerMin + maxPerMin) / 2;
  const avgTotalRate = avgPerPromoterRate * targets.length;
  const estimatedMinutes = Math.ceil(runCount / avgTotalRate);

  const log = (msg) => {
    onLog(msg);
    console.log(msg);
  };

  log(
    `Starting ${runCount} form submission(s) | ${targets
      .map((target) => `${target.promoter}×${target.count}`)
      .join(", ")} | random ${minPerMin}–${maxPerMin} per promoter/min (${minPerMin * targets.length}–${maxPerMin * targets.length} total, ~${estimatedMinutes} min)...`,
  );
  log(`Form URL: ${resolveFormUrl(config)}`);
  log(`Promoter order (shuffled): ${promoters.join(", ")}`);

  const peakConcurrent = targets.length * maxPerMin;
  const poolSize = Math.max(1, Math.ceil(peakConcurrent / PAGES_PER_BROWSER));
  log(
    `Chromium pool: ${poolSize} browser(s) × up to ${PAGES_PER_BROWSER} pages (peak ${peakConcurrent} simultaneous)`,
  );

  const pool = createBrowserPool({ headless, size: poolSize, onLog: log });
  const results = [];
  const doneByPromoter = Object.fromEntries(promoters.map((p) => [p, 0]));
  let completed = 0;
  let batchNumber = 0;

  try {
    for (let offset = 0; offset < runCount; ) {
      if (shouldStop()) {
        log("Stopped by user.");
        break;
      }

      batchNumber += 1;
      const perPromoterBatchSize = randomInt(minPerMin, maxPerMin);
      const batch = [];
      for (const target of targets) {
        const remaining = target.count - doneByPromoter[target.promoter];
        for (let n = 1; n <= Math.min(perPromoterBatchSize, remaining); n++) {
          batch.push({
            promoter: target.promoter,
            indexInPromoter: doneByPromoter[target.promoter] + n,
            countPer: target.count,
          });
        }
      }
      if (batch.length === 0) break;
      const batchStartedAt = Date.now();
      log(
        `\n--- Batch ${batchNumber}: ${perPromoterBatchSize} per promoter, launching ${batch.length} form(s) simultaneously ---`,
      );

      await Promise.all(
        batch.map(async (item, index) => {
          const run = offset + index + 1;
          doneByPromoter[item.promoter] =
            (doneByPromoter[item.promoter] || 0) + 1;
          const data = buildRunData({ ...config, promoter: item.promoter });

          const formName = formShortName(resolveFormUrl(config));
          log(
            `Run ${formName} ${run}/${runCount} | ${item.promoter} (${doneByPromoter[item.promoter]}/${item.countPer}) | ${data.answers?.gender ?? "configured data"}`,
          );

          if (index > 0) {
            await new Promise((resolve) => setTimeout(resolve, index * 15));
          }

          let lastError;
          for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
            try {
              const result = await pool.withPage(index, async (page) => {
                await fillForm(page, data, { isFirstRun: true });
                return {
                  run,
                  name: data.fullName,
                  promoter: item.promoter,
                  formUrl: resolveFormUrl(config),
                  status: "success",
                  url: page.url(),
                };
              });
              results.push(result);
              log(
                `Run ${run} done${attempt > 1 ? ` on retry ${attempt - 1}` : ""}: ${result.url}`,
              );
              lastError = null;
              break;
            } catch (error) {
              if (error.message === "Stopped by user") throw error;
              lastError = error;
              if (attempt <= MAX_RETRIES) {
                const waitMs = isBrowserDeadError(error) ? 400 * attempt : 200;
                log(
                  `Run ${run} failed (attempt ${attempt}); retrying (${MAX_RETRIES - attempt} retries left): ${shortError(error)}`,
                );
                await new Promise((resolve) => setTimeout(resolve, waitMs));
              }
            }
          }

          if (lastError) {
            const result = {
              run,
              name: data.fullName,
              promoter: item.promoter,
              formUrl: resolveFormUrl(config),
              status: "failed",
              error: shortError(lastError),
            };
            results.push(result);
            console.error(
              `Run ${run} failed after ${MAX_RETRIES} retries: ${result.error}`,
            );
            log(
              `Run ${run} failed after ${MAX_RETRIES} retries: ${result.error}`,
            );
          }

          completed += 1;
          onProgress({ current: completed, total: runCount, results });
        }),
      );

      offset += batch.length;
      if (offset < runCount && !shouldStop()) {
        await waitForNextBatch(batchStartedAt, { shouldStop, onLog });
      }
    }
  } finally {
    if (!headless) {
      log("\nBrowser will close in 5 seconds...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    await pool.close();
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;

  log(`\n=== Form summary (${formShortName(resolveFormUrl(config))}) ===`);
  log(`Total: ${results.length} | Success: ${succeeded} | Failed: ${failed}`);
  for (const target of targets) {
    const ok = results.filter(
      (r) => r.promoter === target.promoter && r.status === "success",
    ).length;
    const bad = results.filter(
      (r) => r.promoter === target.promoter && r.status === "failed",
    ).length;
    log(
      `  ${target.promoter}: success ${ok} | failed ${bad} | target ${target.count}`,
    );
  }

  return {
    results,
    succeeded,
    failed,
    total: results.length,
    promoters,
    targets,
  };
}

async function main() {
  const config = loadConfig();
  await runBatch(config, { headless: process.env.HEADLESS === "true" });
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
