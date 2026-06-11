# ---- Stage 1: Build ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Embed the status-map against the same-origin /stack path (NPM routes
# /stack/api/* -> status-dashboard-api), so the login cookie flows to it.
ENV VITE_STATUS_MAP_API=/stack
RUN npm run build

# ---- Stage 2: Serve ----
FROM nginx:alpine

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Custom nginx config for SPA + API proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
