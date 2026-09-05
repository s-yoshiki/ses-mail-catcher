# The build context is the repository root, because the server bundles the
# viewer from packages/viewer:
#
#   docker build -f packages/local/Dockerfile -t ses-mail-catcher-local .

FROM node:24-bookworm-slim AS build

RUN npm install --global pnpm@11.25.0

WORKDIR /repo

# Manifests first so the dependency layer survives source changes. The cdk
# manifest is copied for the lockfile check only; --filter keeps its
# dependencies out of the install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/cdk/package.json packages/cdk/
COPY packages/local/package.json packages/local/
COPY packages/viewer/package.json packages/viewer/
RUN pnpm install --frozen-lockfile \
  --filter ses-mail-catcher-local \
  --filter ses-mail-catcher-viewer

COPY packages/viewer packages/viewer
COPY packages/local packages/local

# `deploy` resolves the workspace into a self-contained tree, so the runtime
# stage needs no package manager and no workspace layout.
RUN pnpm --filter ses-mail-catcher-viewer build \
  && pnpm --filter ses-mail-catcher-local build \
  && pnpm --filter ses-mail-catcher-local deploy --prod --legacy /out

FROM node:24-bookworm-slim

WORKDIR /app
COPY --from=build /out ./
RUN mkdir -p /data && chown node:node /data

USER node
ENV SES_MAIL_CATCHER_DB_PATH=/data/mailbox.sqlite3
# The published port is only reachable when the server binds beyond the
# container loopback interface. The CLI still defaults to 127.0.0.1.
ENV SES_MAIL_CATCHER_HOST=0.0.0.0
ENV SES_MAIL_CATCHER_PORT=8005
EXPOSE 8005
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.SES_MAIL_CATCHER_PORT||8005)+'/health-check').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "lib/cli.js"]
