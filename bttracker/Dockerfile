FROM node:latest

WORKDIR /app
RUN npm install -g bittorrent-tracker

CMD ["bittorrent-tracker", "--port", "8000", "--http", "--ws"]