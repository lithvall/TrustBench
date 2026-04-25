FROM node:20-alpine

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install everything (including tsx)
RUN npm ci

# Copy source code
COPY . .

# Use npx to ensure tsx is found
CMD ["npx", "tsx", "src/index.ts"]