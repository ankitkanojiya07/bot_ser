# Deploy on AWS Lightsail (recommended) or EC2

Chromium needs ~1–2 GB RAM. Use at least a **2 GB** instance.

## Option A — Lightsail (simplest)

### 1. Create instance

1. Open [Lightsail console](https://lightsail.aws.amazon.com/)
2. **Create instance**
   - Platform: **Linux/Unix**
   - Blueprint: **Ubuntu 22.04** or **24.04**
   - Size: **$10/mo (2 GB RAM)** or larger
   - Name: e.g. `form-bot`
3. Create → wait until **Running**

### 2. Open port 3000

1. Instance → **Networking**
2. **Add rule**: Application Custom, Protocol TCP, Port **3000**
3. Save

### 3. Upload the bot

**SSH** from Lightsail (browser SSH) or:

```bash
# From your Mac — use the key Lightsail downloads
scp -i ~/Downloads/LightsailDefaultKey-*.pem -r \
  Dockerfile package.json package-lock.json \
  fill-form.js random-data.js server.js form-data.example.json \
  deploy \
  ubuntu@YOUR_PUBLIC_IP:/home/ubuntu/form-bot
```

Or push to GitHub and on the instance:

```bash
sudo apt-get update -y && sudo apt-get install -y git
git clone YOUR_REPO_URL /opt/form-bot
cd /opt/form-bot
```

### 4. Install Docker and start

On the instance (from the repo root):

```bash
cd ~/form-bot   # or wherever you cloned/copied
bash deploy/setup-instance.sh
```

### 5. Open the UI

```
http://YOUR_PUBLIC_IP:3000
```

Enter promoter, count, per minute → **Start**.

### Useful commands

```bash
sudo docker logs -f form-bot     # live logs
sudo docker restart form-bot     # restart
sudo docker stop form-bot        # stop
```

---

## Option B — EC2

Same app, different networking:

1. Launch **Ubuntu 22.04** AMI, instance type **t3.small** (2 GB) or **t3.medium**
2. Security group: inbound **22** (your IP) and **3000** (0.0.0.0/0 or your IP)
3. SSH in, clone/upload files, run `deploy/setup-instance.sh`
4. Open `http://PUBLIC_IP:3000`

---

## Rebuild after code changes

```bash
cd /opt/form-bot   # or your app dir
# git pull   OR   re-scp files
sudo docker build -t form-bot .
sudo docker rm -f form-bot
sudo docker run -d --name form-bot --restart unless-stopped -p 3000:3000 -e HEADLESS=true form-bot
```

## Tips

- Prefer restricting port **3000** to your IP in Lightsail/EC2 firewall if the UI should not be public.
- Free-tier EC2 (t2/t3.micro, 1 GB) is often **too small** for Playwright; expect OOM kills — use 2 GB+.
- Job keeps running if you close the browser tab; use **Stop** in the UI to cancel.
