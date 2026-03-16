FROM archlinux:latest

# Cài Node.js và npm
RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm nodejs npm curl && \
    pacman -Scc --noconfirm

WORKDIR /app

# Copy và cài dependencies
COPY package*.json ./
RUN npm install --production

# Copy source
COPY server.js ./
COPY public/ ./public/

# Kiểm tra file tồn tại
RUN test -f server.js && test -f public/index.html

EXPOSE 3000

# Chạy với node
CMD ["node", "server.js"]
