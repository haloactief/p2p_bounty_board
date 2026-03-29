FROM oven/bun:latest AS builder

WORKDIR /app
COPY . .

ARG VITE_DOMAIN
ENV VITE_DOMAIN=${VITE_DOMAIN}

RUN bun install && bun run build

FROM nginx:latest

COPY --from=builder /app/dist /usr/share/nginx/html