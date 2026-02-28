# Stage 1: Build widget + admin panel
FROM node:20-alpine AS builder
WORKDIR /app

# Install root deps (includes esbuild)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build widget
RUN node widget/build.js

# Build admin panel
WORKDIR /app/admin
RUN npm ci
RUN npm run build

WORKDIR /app

# Stage 2: Production runtime
FROM node:20-alpine

# Add tini for proper signal handling
RUN apk add --no-cache tini

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copy built assets
COPY --from=builder /app/widget/dist ./widget/dist
COPY --from=builder /app/admin/dist ./admin/dist

# Copy server source
COPY src ./src
COPY .env.example ./.env.example

# Create data and uploads directories
RUN mkdir -p /app/data /app/uploads

VOLUME ["/app/data", "/app/uploads"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
