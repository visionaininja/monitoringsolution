# syntax=docker/dockerfile:1
# ─── Stage 1: Build Frontend ─────────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /app

# Upgrade npm once, cached across builds via BuildKit cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm install -g npm@12 --quiet

# Copy lockfiles first so npm ci can be cache-mounted efficiently
COPY package.json package-lock.json ./

# Install deps — npm cache is reused from BuildKit cache even with --no-cache
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps --no-audit --no-fund --loglevel=error

# Copy only the files needed to build
COPY tsconfig.json tsconfig.node.json vite.config.ts postcss.config.js tailwind.config.js index.html ./
COPY src/ ./src/
COPY public/ ./public/

# Build the frontend
RUN npm run build

# ─── Stage 2: Production Runtime ─────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# Upgrade npm, cached
RUN --mount=type=cache,target=/root/.npm \
    npm install -g npm@12 --quiet

# Install backend dependencies using lockfile
COPY server/package.json server/package-lock.json ./server/
WORKDIR /app/server
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund --loglevel=error

# Copy backend source (after deps to preserve layer ordering)
WORKDIR /app
COPY server/ ./server/

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/dist ./dist

# Initialize keys directory and config
RUN mkdir -p server/keys && cp server/config.example.json server/config.json || true

EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=production

CMD ["node", "server/index.js"]
