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

# Install the Linux cloudflared binary on PATH so server/launch.js can start
# the Cloudflare Tunnel (same behaviour as `npm run start`). Arch-aware so the
# image works on both amd64 and arm64 hosts.
RUN apk add --no-cache ca-certificates wget \
    && case "$(apk --print-arch)" in \
         x86_64)  CF_ARCH=amd64 ;; \
         aarch64) CF_ARCH=arm64 ;; \
         armv7)   CF_ARCH=arm ;; \
         *)       CF_ARCH=amd64 ;; \
       esac \
    && wget -q -O /usr/local/bin/cloudflared \
       "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}" \
    && chmod +x /usr/local/bin/cloudflared

# Only production dependencies for the runtime
COPY package*.json ./
RUN npm ci --omit=dev

# Bring over the compiled frontend + server + static assets
COPY --from=build /app/dist ./dist
COPY server ./server
COPY public ./public

EXPOSE 4567

# Start the server AND the Cloudflare Tunnel (launch.js finds cloudflared on
# PATH). Set NO_TUNNEL=1 (or override CMD to node server/index.js) to run the
# plain server when you expose the app via your own ingress/reverse proxy.
CMD ["node", "server/launch.js"]
