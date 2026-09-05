FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package.json tsconfig.json tsconfig.build.json ./
RUN npm install
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim

WORKDIR /app
COPY package.json ./
COPY --from=build /app/lib ./lib
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
