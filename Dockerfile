# Single image for web + worker + migrate (commands differ per compose service).
FROM node:22-slim AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Install dependencies (full, incl. dev — needed for next build, tsx, drizzle-kit).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/venues/package.json ./packages/venues/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
RUN pnpm install --frozen-lockfile

# Source.
COPY . .

# Build the web app (worker runs via tsx, no build needed). force-dynamic pages
# do not touch the DB at build time, so no database is required here.
RUN pnpm --filter web build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]
