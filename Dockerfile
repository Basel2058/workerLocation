# syntax=docker/dockerfile:1

# --- Build: install everything, compile the web app and the server bundle ---
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 ships prebuilt binaries for Linux/macOS/Windows (x64 and arm64), so no compiler is needed;
# skipping install scripts stops npm from compiling SQLite from source anyway.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev

# --- Run: only production dependencies and the built files ---
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/server/index.js"]
