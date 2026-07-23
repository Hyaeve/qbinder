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
RUN mkdir -p /data
COPY --from=backend /out/qbinder ./qbinder
COPY --from=frontend /app/dist ./dist
EXPOSE 18086
CMD ["./qbinder"]
