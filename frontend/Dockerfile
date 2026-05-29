# ============================================
# AgentFlow AI - Frontend Dockerfile
# Multi-stage build for optimized production image
# ============================================

# Stage 1: Build the React application
FROM node:20-alpine as builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
RUN npm ci --silent

# Copy source code and build
COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Remove default nginx config
RUN rm -rf /etc/nginx/conf.d/*

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create non-root user
RUN addgroup -S agentflow && adduser -S agentflow -G agentflow
RUN chown -R agentflow:agentflow /usr/share/nginx/html \
    && chown -R agentflow:agentflow /var/cache/nginx \
    && chown -R agentflow:agentflow /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown -R agentflow:agentflow /var/run/nginx.pid

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
