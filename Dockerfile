# Playwright image includes Chromium + system deps
FROM mcr.microsoft.com/playwright:v1.61.0-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY fill-form.js random-data.js server.js form-data.json form-data.example.json ./

ENV HEADLESS=true
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
