# ---- Build stage: compile the frontend ----
FROM node:20-alpine AS build
WORKDIR /app

# Install ALL deps (build needs devDependencies like vite)
COPY package*.json ./
RUN npm ci

# Build the React frontend into dist/
COPY . .
RUN npm run build

# ---- Runtime stage: slim production image ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4567

# Only production dependencies for the runtime
COPY package*.json ./
RUN npm ci --omit=dev

# Bring over the compiled frontend + server + static assets
COPY --from=build /app/dist ./dist
COPY server ./server
COPY public ./public

EXPOSE 4567

# Plain server (no Cloudflare Tunnel) — expose publicly via your ingress/proxy.
CMD ["node", "server/index.js"]
