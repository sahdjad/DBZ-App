# Portables Deployment-Image der DBZ-App (Fly.io, Railway, eigener Server, ...).
# Baut das Frontend und startet den Express-Server, der API + Frontend ausliefert.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV DBZ_DATA_DIR=/data
# Nur Server-Abhängigkeiten für ein schlankes Laufzeit-Image
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
VOLUME ["/data"]
EXPOSE 4000
CMD ["node", "server/index.js"]
