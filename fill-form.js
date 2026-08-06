import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join, resolve } from "path";
import { generateRandomIndianName, generateRandomAnswers } from "./random-data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FORM_URL = "https://seeedemaseekhelp.com/kanwar_yatra/";
const DATA_FILE = join(__dirname, "form-data.json");

const LANGUAGES = {
  English: "3",
  "অসমীয়া": "1",
  "বাঙ্গালি": "2",
  "ગુજરાતી": "4",
  "हिंदी": "5",
  "ಕನ್ನಡ": "6",
  "മലയാളം": "7",
  "मराठी": "8",
  "ଓଡ଼ିଆ": "9",
  "ਪੰਜਾਬੀ": "10",
  "தமிழ்": "11",
  "తెలుగు": "12",
};

const LANGUAGE_FORMS = {
  "3": {
    age: { "< 50 years": "21-0-0", "> 50 years": "21-1-1" },
    gender: { Female: "22-0-1", Others: "22-1-1", Male: "22-2-1" },
    yesNo: { qst_2: "23", qst_3: "24", qst_4: "25", qst_5: "26", qst_6: "27", qst_7: "28", qst_8: "29" },
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
  "5": {
    age: { "< 50 years": "41-0-0", "> 50 years": "41-1-1" },
    gender: { Male: "42-0-1", Female: "42-1-1", Others: "42-2-1" },
    yesNo: { qst_2: "43", qst_3: "44", qst_4: "45", qst_5: "46", qst_6: "47", qst_7: "48", qst_8: "49" },
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
      `Missing ${DATA_FILE}. Copy form-data.example.json to form-data.json and edit your values.`
    );
  }
  return JSON.parse(readFileSync(DATA_FILE, "utf8"));
}

function buildRunData(config) {
  if (config.random !== false) {
    return {
      ...config,
      fullName: generateRandomIndianName(),
      answers: generateRandomAnswers(),
    };
  }
  return config;
}

function getRunCount(config) {
  const fromEnv = Number(process.env.COUNT);
  if (!Number.isNaN(fromEnv) && fromEnv > 0) return fromEnv;
  return config.count ?? 1;
}

function getPerMinute(config) {
  const fromEnv = Number(process.env.PER_MINUTE);
  if (!Number.isNaN(fromEnv) && fromEnv > 0) return fromEnv;
  return config.perMinute ?? 4;
}

/** Wait until fewer than `perMinute` runs have started in the last 60s. */
async function waitForRateLimit(recentStarts, perMinute, { shouldStop, onLog } = {}) {
  const windowMs = 60_000;

  while (true) {
    if (shouldStop?.()) throw new Error("Stopped by user");

    const now = Date.now();
    while (recentStarts.length > 0 && now - recentStarts[0] >= windowMs) {
      recentStarts.shift();
    }

    if (recentStarts.length < perMinute) return;

    const waitMs = windowMs - (now - recentStarts[0]) + 50;
    const msg = `Rate limit: ${perMinute}/minute reached — waiting ${Math.ceil(waitMs / 1000)}s...`;
    onLog?.(msg);
    console.log(msg);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

function getLanguageId(data) {
  return LANGUAGES[data.language] ?? data.language;
}

function getFormConfig(languageId) {
  const config = LANGUAGE_FORMS[languageId];
  if (!config) {
    throw new Error(`Form values for language id "${languageId}" are not configured yet.`);
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
    const value = resolveRadioValue(formConfig, fieldName, answerKey, answers[answerKey]);
    if (!value) {
      throw new Error(`Unknown answer for ${answerKey}: ${answers[answerKey]}`);
    }
    await page.locator(`input[name="${fieldName}"][value="${value}"]`).check({ force: true });
  }

  for (const condition of answers.clinicalConditions ?? []) {
    const value = formConfig.clinicalConditions[condition];
    if (!value) throw new Error(`Unknown clinical condition: ${condition}`);
    await page.locator(`input[name="qst_9[]"][value="${value}"]`).check({ force: true });
  }

  for (const disorder of answers.disorders ?? []) {
    const value = formConfig.disorders[disorder];
    if (!value) throw new Error(`Unknown disorder: ${disorder}`);
    await page.locator(`input[name="qst_10[]"][value="${value}"]`).check({ force: true });
  }

  await page.locator("#checkbox").check();
  await page.locator("#submit").click();
  await page.waitForSelector('a[href*="report_view"]', { timeout: 15000 });
}

async function goBackToFormViaReport(page) {
  const reportLink = page.locator('a[href*="report_view"]');

  const [reportPage] = await Promise.all([
    page.context().waitForEvent("page"),
    reportLink.click(),
  ]);

  await reportPage.waitForLoadState("networkidle");
  await reportPage.getByText(/back to form/i).click();
  await reportPage.waitForSelector('select[name="language"]', { timeout: 15000 });

  return reportPage;
}

async function fillForm(page, data, { isFirstRun }) {
  if (isFirstRun) {
    await page.goto(FORM_URL, { waitUntil: "networkidle" });
  }

  await fillStep1(page, data);
  await fillStep2(page, data);
  await page.waitForLoadState("networkidle");
}

/**
 * Run a batch of form submissions.
 * @param {object} config - { language, promoter, count, perMinute, random? }
 * @param {object} options - { headless?, onLog?, onProgress?, shouldStop? }
 */
export async function runBatch(config, options = {}) {
  const {
    headless = process.env.HEADLESS === "true",
    onLog = () => {},
    onProgress = () => {},
    shouldStop = () => false,
  } = options;

  const runCount = getRunCount(config);
  const perMinute = getPerMinute(config);
  const estimatedMinutes = Math.ceil(runCount / perMinute);

  const log = (msg) => {
    onLog(msg);
    console.log(msg);
  };

  log(
    `Starting ${runCount} form submission(s) | promoter=${config.promoter} | max ${perMinute}/minute (~${estimatedMinutes} min)...`
  );

  const browser = await chromium.launch({ headless });
  const results = [];
  let page = await browser.newPage();
  const recentStarts = [];

  try {
    for (let i = 1; i <= runCount; i++) {
      if (shouldStop()) {
        log("Stopped by user.");
        break;
      }

      await waitForRateLimit(recentStarts, perMinute, { shouldStop, onLog });
      if (shouldStop()) {
        log("Stopped by user.");
        break;
      }
      recentStarts.push(Date.now());

      const data = buildRunData(config);

      log(`\n--- Run ${i}/${runCount} ---`);
      log(`Name: ${data.fullName}`);

      try {
        await fillForm(page, data, { isFirstRun: i === 1 });
        const result = { run: i, name: data.fullName, status: "success", url: page.url() };
        results.push(result);
        log(`Run ${i} done: ${page.url()}`);
        onProgress({ current: i, total: runCount, results });

        if (i < runCount && !shouldStop()) {
          log("Opening Report View, then Back to form...");
          page = await goBackToFormViaReport(page);
        }
      } catch (error) {
        if (error.message === "Stopped by user") throw error;
        const result = { run: i, name: data.fullName, status: "failed", error: error.message };
        results.push(result);
        console.error(`Run ${i} failed: ${error.message}`);
        onLog(`Run ${i} failed: ${error.message}`);
        onProgress({ current: i, total: runCount, results });

        try {
          await page.screenshot({ path: join(__dirname, `error-run-${i}.png`), fullPage: true });
        } catch {
          /* ignore screenshot errors */
        }

        if (i < runCount && !shouldStop()) {
          page = await browser.newPage();
          await page.goto(FORM_URL, { waitUntil: "networkidle" });
        }
      }
    }
  } finally {
    try {
      await page.close();
    } catch {
      /* already closed */
    }
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
  for (const result of results) {
    log(`  Run ${result.run}: ${result.status} - ${result.name}`);
  }

  return { results, succeeded, failed, total: results.length };
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
