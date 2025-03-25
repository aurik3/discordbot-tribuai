FROM node:18-slim

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json ./
COPY pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install

# Copy app source
COPY . .

# Set environment variables (these will be overridden by actual env vars at runtime)
ENV NODE_ENV=production

# Start the bot
CMD ["node", "index.js"]