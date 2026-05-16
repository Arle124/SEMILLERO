FROM node:26-alpine

WORKDIR /app

COPY package*.json ./

# Esto ahora pasará volando porque solo instalará 'pg' y librerías puras de JS
RUN npm install --omit=dev

COPY . .

USER node

CMD ["node", "bridge.js"]
