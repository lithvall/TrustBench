FROM node:20-alpine

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install everything (including tsx)
RUN npm ci

# Copy source code
COPY . .

# Run directly with tsx (no build step needed)
CMD ["tsx", "src/index.ts"]