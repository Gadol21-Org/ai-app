# syntax=docker/dockerfile:1
# Family AI: Next.js app (PWA + chat API) as a standalone Node server.
# Built natively on the target architecture (an arm64 runner for an arm64 Oracle VM).

FROM node:26-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Third-party MCP servers the agent launches over stdio (pinned by mcp-servers/package-lock.json).
FROM node:26-bookworm-slim AS mcp
WORKDIR /mcp-servers
COPY mcp-servers/package.json mcp-servers/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:26-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:26-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=mcp --chown=node:node /mcp-servers ./mcp-servers
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
