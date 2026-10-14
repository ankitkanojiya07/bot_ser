## Learned User Preferences
- Wants run settings (promoter IDs with per-ID completion counts, min/max per minute, language, and form URL) changeable from the web UI, not hardcoded.
- Wants multiple form URLs in one job, each with its own promoter IDs and per-ID counts, running in parallel from the UI with no shared browser/page cap (scale the host instead of capping).
- Wants per-minute submissions spaced evenly across the minute (interval ≈ 60/rate seconds between fills) plus a hard 60s window cap so the next window never starts early (no exceeding max rate on the clock).
- Wants estimated total completion time shown in the web UI only (Est. time from largest promoter count vs min–max rate); not remaining/elapsed tracking or extra server/log ETA fields.

## Learned Workspace Facts
- Form URL is configurable from the UI; the current campaign URL is https://seeedemaseekhelp.com/Weekend_Activity_6/ (not Weekend_Activity_5 or the older README `kanwar_yatra` path).
- The web UI is served by `server.js`; `fill-form.js` performs Playwright submissions.
- Jobs are campaign rows (form URL + promoter ID/count pairs per row); rate and language are shared. Each promoter stops at its own count. Campaigns run in parallel with no shared global Playwright page cap.
- Question option IDs in `fill-form.js` (`LANGUAGE_FORMS`) are form-version specific; stale Hindi age radios (`qst_0`) cause 30s `locator.check` timeouts and must be rematched to the live form HTML.
- Production is typically a Docker container named `form-bot` on port 3000 with `--shm-size=2g`, often under `/opt/form-bot` on Ubuntu EC2 via `deploy/setup-instance.sh`. The container must be rebuilt/recreated after code changes (restart is not enough). Connect commonly uses EC2 Instance Connect (`aws ec2-instance-connect ssh --os-user ubuntu --region ap-south-1`).
- Opening ~144 Playwright pages in one Chromium process crashed production (GPU/SwiftShader CreateCommandBuffer, then SIGILL CFI / ILL_ILLOPN); after the pid died, retries failed with "Target page, context or browser has been closed" and dumped full browser logs.
- `fill-form.js` paces each promoter sequentially (random rate in min–max each minute, interval = 60/rate, then wait out remaining time to a full 60s before the next window); Chromium pool is 6 pages per process (pool count = ceil(promoters / 6), relaunch on crash), args `--disable-gpu` / `--disable-gpu-compositing` / `--disable-software-rasterizer` / `--disable-dev-shm-usage`, `ignoreDefaultArgs` `--enable-unsafe-swiftshader`, `goto` waitUntil `domcontentloaded`, `shortError` (no Browser/Call log dumps), and no failure screenshots.
- A 2GB instance may still OOM at ~144 concurrent pages even with pooling (burst-era failure mode; even pacing keeps peak near one page per promoter).
- Peak simultaneous Chromium pages is about total promoter IDs across running links (one in-flight page per promoter); there is no hardcoded max for links or IDs.
- `parsePromoterTargets` in `fill-form.js` accepts `{id, count}` arrays (or a shared fallback count); failed runs after retries count as failed, so successes can land below the typed target.
