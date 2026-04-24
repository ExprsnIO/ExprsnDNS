FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
COPY src/shared/package.json ./src/shared/
COPY src/exprsn-auth/package.json ./src/exprsn-auth/
COPY src/exprsn-ca/package.json ./src/exprsn-ca/
COPY src/exprsn-dns/package.json ./src/exprsn-dns/

RUN npm install --workspace @exprsn/auth --workspace @exprsn/shared --include-workspace-root

COPY src/shared ./src/shared
COPY src/exprsn-auth ./src/exprsn-auth

ENV NODE_ENV=production
EXPOSE 3002
WORKDIR /app/src/exprsn-auth
CMD ["node", "src/index.js"]
