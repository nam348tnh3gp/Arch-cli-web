# Dockerfile - Arch Terminal Controller for Render
FROM archlinux:latest

# Cập nhật hệ thống
RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm \
    nodejs \
    npm \
    curl \
    wget \
    python \
    ffmpeg \
    git \
    neofetch \
    && pacman -Scc --noconfirm

# Tạo thư mục app
WORKDIR /app

# Copy package.json và cài dependencies
COPY package.json ./
RUN npm install

# Copy source code
COPY server.js ./
COPY public/ ./public/

# Cài yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Tạo thư mục downloads
RUN mkdir -p /downloads && chmod 777 /downloads

# Kiểm tra file index.html tồn tại
RUN test -f /app/public/index.html || (echo "ERROR: index.html not found!" && exit 1)

# Expose port (Render sẽ tự động map)
EXPOSE 3000

# Start script
CMD ["node", "server.js"]
