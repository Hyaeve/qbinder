FROM node:22-alpine AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM golang:1.23-alpine AS backend
WORKDIR /app
COPY go.mod go.sum ./
COPY server ./server
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/qbinder ./server

FROM alpine:3.20 AS runner
WORKDIR /app
ENV PORT=18086
ENV QBINDER_DATA_DIR=/data
ENV TMPDIR=/data/tmp
RUN addgroup -S -g 10001 qbinder \
    && adduser -S -D -H -u 10001 -G qbinder qbinder \
    && mkdir -p /data/tmp \
    && chown -R qbinder:qbinder /app /data
COPY --from=backend --chown=qbinder:qbinder /out/qbinder ./qbinder
COPY --from=frontend --chown=qbinder:qbinder /app/dist ./dist
USER qbinder
EXPOSE 18086
CMD ["./qbinder"]
