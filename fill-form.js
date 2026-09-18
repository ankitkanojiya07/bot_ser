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
  "https://seeedemaseekhelp.com/Weekend_Activity_4/";
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

function resolvePromoters(config) {
  const fromList = parsePromoters(config.promoters ?? config.promoter ?? "");
  if (fromList.length === 0) {
    throw new Error(
      "At least one promoter is required (e.g. 48,49,53 or Promoter-3)",
    );
  }
  const shuffledPromoters = shuffleInPlace([...fromList]);
  const countPer = getRunCount(config);
  return { promoters: shuffledPromoters, countPer };
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

  for (const [fieldName, answerKey] of RADIO_FIELDS) {
    const value = resolveRadioValue(
      formConfig,
      fieldName,
      answerKey,
      answers[answerKey],
    );
    if (!value) {
      throw new Error(`Unknown answer for ${answerKey}: ${answers[answerKey]}`);
    }
    await page
      .locator(`input[name="${fieldName}"][value="${value}"]`)
      .check({ force: true });
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

async function fillForm(page, data, { isFirstRun }) {
  if (isFirstRun) {
    await page.goto(resolveFormUrl(data), { waitUntil: "networkidle" });
  }

  await fillStep1(page, data);
  await fillStep2(page, data);
  await page.waitForLoadState("networkidle");
}

/**
 * Run a batch of form submissions.
 * @param {object} config - { formUrl?, language, promoter|promoters, count (per promoter), perMinuteMin, perMinuteMax, random? }
 * @param {object} options - { headless?, onLog?, onProgress?, shouldStop? }
 */
export async function runBatch(config, options = {}) {
  const {
    headless = process.env.HEADLESS === "true",
    onLog = () => {},
    onProgress = () => {},
    shouldStop = () => false,
  } = options;

  const { promoters, countPer } = resolvePromoters(config);
  const runCount = promoters.length * countPer;
  const { min: minPerMin, max: maxPerMin } = getPerMinuteRange(config);
  const avgPerPromoterRate = (minPerMin + maxPerMin) / 2;
  const avgTotalRate = avgPerPromoterRate * promoters.length;
  const estimatedMinutes = Math.ceil(runCount / avgTotalRate);

  const log = (msg) => {
    onLog(msg);
    console.log(msg);
  };

  log(
    `Starting ${runCount} form submission(s) | ${promoters.length} promoter(s) × ${countPer} | random ${minPerMin}–${maxPerMin} per promoter/min (${minPerMin * promoters.length}–${maxPerMin * promoters.length} total, ~${estimatedMinutes} min)...`,
  );
  log(`Form URL: ${resolveFormUrl(config)}`);
  log(`Promoter order (shuffled): ${promoters.join(", ")}`);

  const browser = await chromium.launch({ headless });
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
      for (const promoter of promoters) {
        const remaining = countPer - doneByPromoter[promoter];
        for (let n = 1; n <= Math.min(perPromoterBatchSize, remaining); n++) {
          batch.push({
            promoter,
            indexInPromoter: doneByPromoter[promoter] + n,
            countPer,
          });
        }
      }
      const batchStartedAt = Date.now();
      log(
        `\n--- Batch ${batchNumber}: ${perPromoterBatchSize} per promoter, launching ${batch.length} form(s) simultaneously ---`,
      );

      await Promise.all(
        batch.map(async (slot, index) => {
          const run = offset + index + 1;
          doneByPromoter[slot.promoter] =
            (doneByPromoter[slot.promoter] || 0) + 1;
          const data = buildRunData({ ...config, promoter: slot.promoter });

          log(
            `Run ${run}/${runCount} | ${slot.promoter} (${doneByPromoter[slot.promoter]}/${slot.countPer}) | ${data.answers?.gender ?? "configured data"}`,
          );
          let lastError;
          for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
            let page;
            try {
              page = await browser.newPage();
              await fillForm(page, data, { isFirstRun: true });
              const result = {
                run,
                name: data.fullName,
                promoter: slot.promoter,
                status: "success",
                url: page.url(),
              };
              results.push(result);
              log(
                `Run ${run} done${attempt > 1 ? ` on retry ${attempt - 1}` : ""}: ${page.url()}`,
              );
              lastError = null;
              break;
            } catch (error) {
              if (error.message === "Stopped by user") throw error;
              lastError = error;
              if (attempt <= MAX_RETRIES) {
                onLog(
                  `Run ${run} failed (attempt ${attempt}); retrying (${MAX_RETRIES - attempt} retries left): ${error.message}`,
                );
              }
            } finally {
              await page?.close().catch(() => {});
            }
          }

          if (lastError) {
            const result = {
              run,
              name: data.fullName,
              promoter: slot.promoter,
              status: "failed",
              error: lastError.message,
            };
            results.push(result);
            console.error(
              `Run ${run} failed after ${MAX_RETRIES} retries: ${lastError.message}`,
            );
            onLog(
              `Run ${run} failed after ${MAX_RETRIES} retries: ${lastError.message}`,
            );
          }

          completed += 1;
          onProgress({ current: completed, total: runCount, results });
          if (lastError) {
            try {
              const errorPage = await browser.newPage();
              await errorPage.screenshot({
                path: join(__dirname, `error-run-${run}.png`),
                fullPage: true,
              });
              await errorPage.close();
            } catch {
              /* ignore screenshot errors */
            }
          }
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
    await browser.close();
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;

  log("\n=== Summary ===");
  log(`Total: ${results.length} | Success: ${succeeded} | Failed: ${failed}`);
  for (const promoter of promoters) {
    const ok = results.filter(
      (r) => r.promoter === promoter && r.status === "success",
    ).length;
    const bad = results.filter(
      (r) => r.promoter === promoter && r.status === "failed",
    ).length;
    log(`  ${promoter}: success ${ok} | failed ${bad}`);
  }

  return {
    results,
    succeeded,
    failed,
    total: results.length,
    promoters,
    countPer,
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
