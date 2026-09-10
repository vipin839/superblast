# ─────────────────────────────────────────────────────────────────────────
# BLASTHub application image.
#
# BLAST+ and the reference databases live in blasthub-base, built separately
# by Dockerfile.base / cloudbuild-base.yaml. Application deploys therefore no
# longer re-download BLAST+ or re-index the databases — that work happens only
# when the base tag is bumped.
#
# Cache invalidation: change BASE_TAG to pick up a new engine or database set.
# ─────────────────────────────────────────────────────────────────────────
ARG BASE_IMAGE=us-central1-docker.pkg.dev/super-blast-497610/cloud-run-source-deploy/blasthub-base
ARG BASE_TAG=blast2.17.0-db3

FROM ${BASE_IMAGE}:${BASE_TAG} AS base
WORKDIR /app

# ── Dependencies ─────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ── Build ────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# Firebase *public* client configuration. These values are shipped to every
# browser by design; Firebase security comes from Auth rules, not from hiding
# them. No server secret (GEMINI_API_KEY, service-account material) is ever
# baked into the image — those arrive as Cloud Run environment variables.
ENV NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyCRV5MYcjju-yrM9Mk2OKY9ccpCZbrrtTc
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=super-blast-497610.firebaseapp.com
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=super-blast-497610
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=super-blast-497610.firebasestorage.app
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=523316980019
ENV NEXT_PUBLIC_FIREBASE_APP_ID=1:523316980019:web:0731b2eeab462cd9e7b646
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=523316980019-u9un31787nok83hhnvugo76vbji5424f.apps.googleusercontent.com

RUN npm run build

# ── Runtime ──────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV BLASTDB=/app/blastdb

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs \
 && mkdir -p /app/temp_queries .next \
 && chown nextjs:nodejs /app/temp_queries .next

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
