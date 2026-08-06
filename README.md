# Edema Form Automation

Automatically fills the multi-step form at [seeedemaseekhelp.com](https://seeedemaseekhelp.com/kanwar_yatra/).

## Web UI (recommended for servers)

Start a control panel where you enter **promoter**, **count**, and **per minute**, then run the job on the server:

```bash
npm install
npx playwright install chromium
npm start
```

Open [http://localhost:3000](http://localhost:3000).

### Docker

```bash
docker build -t form-bot .
docker run -p 3000:3000 form-bot
```

Then open `http://localhost:3000` (or your host’s public URL).

### Deploy on AWS Lightsail / EC2

Step-by-step: **[deploy/AWS.md](deploy/AWS.md)**

Short version: create a **2 GB+** Ubuntu instance → open port **3000** → upload this repo → run:

```bash
sudo bash deploy/setup-instance.sh
```

Then open `http://YOUR_PUBLIC_IP:3000`.

Also works on Railway / Render / any VPS with Docker. Needs a **long-running** host with Chromium — not Vercel/Netlify.

Env vars:

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `HEADLESS` | `true` in Docker | Browser visibility (always headless on servers) |

## CLI (local)

```bash
npm install
npx playwright install chromium
cp form-data.example.json form-data.json
```

Edit `form-data.json`, then:

```bash
npm run fill              # single / batch from JSON, visible browser
npm run fill:headless     # headless

COUNT=50 PER_MINUTE=4 npm run fill:batch:headless
```

## Batch flow

- **`count`** — total forms to fill
- **`perMinute`** — max starts in any rolling 60s window

After each submission (except the last), the script opens **Report View** → **Back to form**, then continues.

| Field | Description |
|-------|-------------|
| `promoter` | Must match a `<select>` option on the form (e.g. `Promoter-3`) |
| `count` | Total forms to submit |
| `perMinute` | Max forms started per rolling minute |
| `language` | `हिंदी` or `English` (others need form-value config) |

## Form steps

1. **Language + HCP consent** — pick language, check consent, submit
2. **Patient form** — name, promoter, questions, consent, submit
