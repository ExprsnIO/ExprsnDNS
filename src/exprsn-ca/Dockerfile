FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
COPY src/shared/package.json ./src/shared/
COPY src/exprsn-ca/package.json ./src/exprsn-ca/
COPY src/exprsn-dns/package.json ./src/exprsn-dns/
COPY src/exprsn-auth/package.json ./src/exprsn-auth/

RUN npm install --workspace @exprsn/ca --workspace @exprsn/shared --include-workspace-root

COPY src/shared ./src/shared
COPY src/exprsn-ca ./src/exprsn-ca

ENV NODE_ENV=production
EXPOSE 3001
WORKDIR /app/src/exprsn-ca
CMD ["node", "index.js"]
