FROM oven/bun:latest AS builder

WORKDIR /app
COPY . .

RUN bun install && bun run build

FROM nginx:latest

COPY --from=builder /app/dist /usr/share/nginx/html