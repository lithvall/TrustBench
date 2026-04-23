# TrustBench — Production Dockerfile (tsx for solo-founder simplicity)
FROM node:20-alpine

WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install everything (devDependencies needed for tsx)
RUN npm ci

# Copy source
COPY . .

# Expose port (Railway sets $PORT automatically)
EXPOSE 3000

# Run with tsx (same as local dev — no TS build headaches)
CMD ["npm", "start"]