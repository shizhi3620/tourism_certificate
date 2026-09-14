FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY content ./content
USER node
EXPOSE 3000
CMD ["npm", "start"]
