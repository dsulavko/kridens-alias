FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci

FROM base AS build
COPY . .
ARG VITE_SERVER_HTTP_URL=""
ARG VITE_SERVER_WS_URL="/ws"
ENV VITE_SERVER_HTTP_URL=$VITE_SERVER_HTTP_URL
ENV VITE_SERVER_WS_URL=$VITE_SERVER_WS_URL
RUN npm run build --workspace=@kridens/client

FROM base AS server
COPY packages/core/src packages/core/src
COPY packages/server/src packages/server/src
COPY packages/server/docker-entrypoint.sh packages/server/docker-entrypoint.sh
RUN chmod +x packages/server/docker-entrypoint.sh
ENV NODE_ENV=production
ENV DB_PATH=/app/data/words.db
EXPOSE 8787
ENTRYPOINT ["packages/server/docker-entrypoint.sh"]

FROM nginx:alpine AS client
COPY --from=build /app/packages/client/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
