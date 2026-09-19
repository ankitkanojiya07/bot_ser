## Learned User Preferences
- Wants run settings (promoter IDs with per-ID completion counts, min/max per minute, language, and form URL) changeable from the web UI, not hardcoded.
- Wants multiple form URLs in one job, each with its own promoter IDs and per-ID counts, running in parallel from the UI with no shared browser/page cap (scale the EC2 instance instead of capping).

## Learned Workspace Facts
- Form URL is configurable from the UI; the current campaign URL is https://seeedemaseekhelp.com/Weekend_Activity_6/ (not Weekend_Activity_5 or the older README `kanwar_yatra` path).
- The web UI is served by `server.js`; `fill-form.js` performs Playwright submissions.
- Jobs are campaign rows (form URL + promoter ID/count pairs per row); rate and language are shared. Each promoter stops at its own count. Campaigns run in parallel with no shared global Playwright page cap.
- Question option IDs in `fill-form.js` (`LANGUAGE_FORMS`) are form-version specific; stale Hindi age radios (`qst_0`) cause 30s `locator.check` timeouts and must be rematched to the live form HTML.
- Production is typically a Docker container named `form-bot` on AWS EC2, port 3000; `deploy/setup-instance.sh` docker run includes `--shm-size=2g`. The container must be rebuilt/recreated after code changes (restart is not enough).
- Opening ~144 Playwright pages in one Chromium process crashed production (GPU/SwiftShader CreateCommandBuffer, then SIGILL CFI / ILL_ILLOPN); after the pid died, retries failed with "Target page, context or browser has been closed" and dumped full browser logs.
- `fill-form.js` uses a Chromium pool of 6 pages per process (pool count = ceil(promoters × maxPerMin / 6), relaunch on crash), args `--disable-gpu` / `--disable-gpu-compositing` / `--disable-software-rasterizer` / `--disable-dev-shm-usage`, `ignoreDefaultArgs` `--enable-unsafe-swiftshader`, `goto` waitUntil `domcontentloaded`, 15ms page stagger, `shortError` (no Browser/Call log dumps), and no failure screenshots.
- A 2GB instance may still OOM at ~144 concurrent pages even with pooling.
- Peak simultaneous Chromium pages is about total promoter IDs across running links × max per minute; there is no hardcoded max for links or IDs.
- `parsePromoterTargets` in `fill-form.js` accepts `{id, count}` arrays (or a shared fallback count); failed runs after retries count as failed, so successes can land below the typed target.
