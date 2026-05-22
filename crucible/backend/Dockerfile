FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY crucible/shared/package.json crucible/shared/package.json
COPY crucible/backend/package.json crucible/backend/package.json
RUN npm ci

FROM deps AS build
COPY crucible/shared crucible/shared
COPY crucible/backend crucible/backend
RUN npm run build -w @crucible/shared && npm run build -w crucible-backend
RUN npm prune --omit=dev

FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/crucible/shared /app/crucible/shared
COPY --from=build /app/crucible/backend/package.json /app/crucible/backend/package.json
COPY --from=build /app/crucible/backend/dist /app/crucible/backend/dist
COPY --from=build /app/crucible/backend/src/db/migrations /app/crucible/backend/src/db/migrations

EXPOSE 3001
CMD ["crucible/backend/dist/index.js"]
