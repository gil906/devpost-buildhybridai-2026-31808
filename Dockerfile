FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8764
ENV HOST=0.0.0.0
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY docs ./docs
RUN mkdir -p /app/dist-artifacts /app/docs/images
EXPOSE 8764
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8764/health || exit 1
CMD ["node", "server/server.mjs"]
