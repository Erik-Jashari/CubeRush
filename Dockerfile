# CubeRush as one container: the API server, which also serves the built web app.
# See docs/DEPLOY.md for what each part means and how to run it.

# ---- Stage 1: install everything and build the web app ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Copy only the package files first, so Docker can reuse the (slow) install step
# when just the source code changed.
COPY package.json package-lock.json ./
COPY packages/cube-core/package.json packages/cube-core/
COPY packages/api/package.json packages/api/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
# --ignore-scripts: better-sqlite3 ships ready-made binaries, but npm ci would still try to
# compile it (needing Python and a C++ compiler). No other package needs its install script.
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build
# The server runs TypeScript directly with tsx, so it needs the sources but not the
# build tools: drop development-only packages.
RUN npm prune --omit=dev --ignore-scripts

# ---- Stage 2: the image that actually runs ----
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/cuberush.db

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/web/dist ./apps/web/dist

# The database lives in /data, a volume: it survives the container being replaced.
RUN mkdir /data && chown node:node /data
VOLUME /data
# Don't run as root inside the container.
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

WORKDIR /app/apps/server
CMD ["/app/node_modules/.bin/tsx", "src/main.ts"]
