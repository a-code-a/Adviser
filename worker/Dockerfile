FROM mcr.microsoft.com/playwright:v1.54.2-noble

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
ENV PORT=8080

CMD ["npm", "run", "worker:start"]
