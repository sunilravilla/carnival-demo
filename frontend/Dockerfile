FROM node:18-alpine AS builder

ARG VITE_API_BASE_URL
ARG VITE_DEMO_BRAND=carnival
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_DEMO_BRAND=$VITE_DEMO_BRAND

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production — nginx serves the built SPA
FROM nginx:alpine

RUN apk add --no-cache curl

COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -fsk https://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
