# TrustBench — Production Dockerfile (solo-founder optimized)
FROM node:20-alpine

WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Full install (devDependencies needed for TypeScript build)
RUN npm ci

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Expose port (Railway sets $PORT automatically)
EXPOSE 3000

CMD ["npm", "start"]