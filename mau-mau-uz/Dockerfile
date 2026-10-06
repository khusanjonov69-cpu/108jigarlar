FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
RUN apk add --no-cache curl ca-certificates && chmod +x scripts/download-assets.sh && ./scripts/download-assets.sh
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node","server/index.js"]
