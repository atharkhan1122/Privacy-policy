# The Engine Room — production image
# Build: docker build -t engine-room .
# Run:   docker run -p 3000:3000 -v engine-data:/data engine-room

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV STANDALONE=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# The durable world lives on the /data volume.
ENV ENGINE_ROOM_DATA=/data/world.json
RUN addgroup -S engine && adduser -S engine -G engine \
  && mkdir -p /data && chown engine:engine /data
COPY --from=build --chown=engine:engine /app/.next/standalone ./
COPY --from=build --chown=engine:engine /app/.next/static ./.next/static
USER engine
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
