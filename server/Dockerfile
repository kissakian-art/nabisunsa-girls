# Director of Studies portal.
#
# Mirrors how books and midway are already built on the VPS: Next.js
# standalone output, and `npm install` rather than `npm ci` because the
# committed lockfiles were generated on Windows and lack the Linux-only
# optional native deps, which makes `npm ci` fail its in-sync check.
#
# Unlike those two, this build does NOT touch the database, so it needs no
# --network web and no DATABASE_URL build arg.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=4500
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# The seed and any future migration runner need the source and tsx.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/db ./db

USER nextjs
EXPOSE 4500
CMD ["node", "server.js"]
