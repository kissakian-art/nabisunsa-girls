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

# The admin scripts run with `docker exec` inside the running container:
# creating the first school, and anything else that cannot be done through
# the portal. Next's standalone output bundles what the app itself imports,
# so a plain `require('mysql2')` from a script finds nothing — these two
# packages (5MB) are installed separately for them.
FROM node:22-alpine AS adminmods
WORKDIR /admin
RUN npm install --no-audit --no-fund --omit=dev mysql2@^3.11.0 bcryptjs@^2.4.3

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=4500
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Order matters: the standalone output brings its own node_modules, and the
# admin modules are merged in afterwards rather than replacing them.
COPY --from=adminmods --chown=nextjs:nodejs /admin/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/db ./db

USER nextjs
EXPOSE 4500
CMD ["node", "server.js"]
