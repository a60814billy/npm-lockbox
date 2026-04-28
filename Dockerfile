FROM node:24-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY frontend ./frontend
COPY src ./src
RUN npm run build

FROM node:24-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    NPM_LB_DB_PATH=/data/npm-lockbox.sqlite \
    NPM_LB_TARBALL_CACHE_DIR=/data/mirror

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force \
    && mkdir -p /data/mirror \
    && chown -R node:node /app /data

COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/frontend/dist ./frontend/dist

USER node

EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/v1/projects', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/index.js"]
