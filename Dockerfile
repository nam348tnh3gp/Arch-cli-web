# Dockerfile - Arch Terminal Pro (No sudo)
FROM archlinux:latest

# Cập nhật hệ thống và khởi tạo keyring (chạy với root)
RUN pacman-key --init && \
    pacman-key --populate && \
    pacman -Syu --noconfirm && \
    pacman -S --noconfirm \
    nodejs \
    npm \
    curl \
    wget \
    python \
    ffmpeg \
    git \
    && pacman -Scc --noconfirm

# Tạo thư mục app
WORKDIR /app

# Copy package.json
COPY package*.json ./
RUN npm install

# Copy source code
COPY server.js ./
COPY public/ ./public/

# Cài yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Tạo thư mục downloads
RUN mkdir -p /downloads && chmod 777 /downloads

# Tạo script refresh keyring (chạy khi start)
RUN echo '#!/bin/bash' > /refresh-keyring.sh && \
    echo 'pacman-key --init' >> /refresh-keyring.sh && \
    echo 'pacman-key --populate' >> /refresh-keyring.sh && \
    echo 'pacman -Sy --noconfirm' >> /refresh-keyring.sh && \
    chmod +x /refresh-keyring.sh

# EXPOSE port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start script - KHÔNG DÙNG SUDO, chạy trực tiếp với root
CMD ["sh", "-c", "/refresh-keyring.sh && node server.js"]
