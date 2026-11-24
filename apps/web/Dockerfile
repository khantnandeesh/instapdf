# Build context: repository root.  docker build -f apps/web/Dockerfile .
# Base image from Google's Docker Hub mirror: same official image, avoids anonymous pull rate limits (429).
FROM mirror.gcr.io/library/node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter web...
COPY apps/web apps/web
# F23 cloud sources: public IDs only (never secrets), inlined at build. Unset means the feature is off.
ARG NEXT_PUBLIC_CLOUD_SOURCES="" NEXT_PUBLIC_DROPBOX_APP_KEY="" NEXT_PUBLIC_GOOGLE_CLIENT_ID="" \
    NEXT_PUBLIC_GOOGLE_API_KEY="" NEXT_PUBLIC_GOOGLE_APP_ID="" NEXT_PUBLIC_ONEDRIVE_CLIENT_ID=""
# Set (https://storage.googleapis.com/<bucket>) when the fonts bucket holds a library: /fonts/lib/*
# is then passed through to it and no copy of the fonts is built into the image.
ARG FONTS_ORIGIN=""
RUN FONTS_ORIGIN="$FONTS_ORIGIN" pnpm --filter web build

FROM mirror.gcr.io/library/node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
