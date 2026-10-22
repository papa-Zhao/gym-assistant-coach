# Build context: repo root (docker build -f apps/api/Dockerfile .)
FROM node:24-slim AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/liff/package.json apps/liff/
RUN npm ci
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @gac/api

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
# sharp is native and external to the bundle; install exactly the version
# pinned in apps/api/package.json.
COPY --from=build /repo/apps/api/package.json /tmp/api-package.json
RUN SHARP_VERSION="$(node -p "require('/tmp/api-package.json').dependencies.sharp")" \
 && npm install --omit=dev --no-save --no-audit --no-fund "sharp@${SHARP_VERSION}" \
 && rm /tmp/api-package.json
COPY --from=build /repo/apps/api/dist dist
USER node
EXPOSE 8080
CMD ["node","dist/server.js"]
