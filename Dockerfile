# Playwright image includes Chromium + system deps
FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY fill-form.js random-data.js server.js form-data.example.json ./
RUN cp form-data.example.json form-data.json

ENV HEADLESS=true
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
