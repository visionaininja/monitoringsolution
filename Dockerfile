# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Copy dependency configs
COPY package.json ./

# Leverage Docker BuildKit cache mount for lightning-fast npm installations and suppress deprecation warnings
RUN --mount=type=cache,target=/root/.npm \
    npm install --legacy-peer-deps --no-audit --no-fund --loglevel=error

# Copy project files
COPY tsconfig.json tsconfig.node.json vite.config.ts postcss.config.js tailwind.config.js index.html ./
COPY src/ ./src/
COPY public/ ./public/

# Build the frontend assets
RUN npm run build

# Stage 2: Build Backend and Run App
FROM node:20-alpine
WORKDIR /app

# Install backend dependencies with BuildKit cache mount
COPY server/package.json ./server/
WORKDIR /app/server
RUN --mount=type=cache,target=/root/.npm \
    npm install --only=production --legacy-peer-deps --no-audit --no-fund --loglevel=error

# Copy backend files
WORKDIR /app
COPY server/ ./server/

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/dist ./dist

# Initialize keys directory and config if not already present
RUN mkdir -p server/keys && cp server/config.example.json server/config.json || true

EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=production

CMD ["node", "server/index.js"]
