FROM node:20-alpine AS base
WORKDIR /app

# Install monorepo workspaces starting from the root so that
# @exprsn/shared, @exprsn/dns, etc. all resolve correctly.
COPY package.json package-lock.json* ./
COPY src/shared/package.json ./src/shared/
COPY src/exprsn-dns/package.json ./src/exprsn-dns/
COPY src/exprsn-ca/package.json ./src/exprsn-ca/
COPY src/exprsn-auth/package.json ./src/exprsn-auth/

RUN npm install --workspace @exprsn/dns --workspace @exprsn/shared --include-workspace-root

COPY src/shared ./src/shared
COPY src/exprsn-dns ./src/exprsn-dns

ENV NODE_ENV=production
EXPOSE 3053 53/udp 53/tcp
WORKDIR /app/src/exprsn-dns
CMD ["node", "index.js"]
