# Dockerfile - Arch Terminal Pro
FROM archlinux:latest

# Cập nhật hệ thống và khởi tạo keyring
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
    sudo \
    && pacman -Scc --noconfirm

# Tạo user để chạy app (không dùng root cho an toàn)
RUN useradd -m -G wheel -s /bin/bash archuser && \
    echo "archuser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Tạo thư mục app
WORKDIR /app

# Copy package.json và package-lock.json
COPY package*.json ./

# Cài dependencies
RUN npm install

# Copy source code
COPY server.js ./
COPY public/ ./public/

# Cài yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Tạo thư mục downloads
RUN mkdir -p /downloads && chmod 777 /downloads

# Tạo script để refresh keyring (chạy mỗi khi container start)
RUN echo '#!/bin/bash' > /refresh-keyring.sh && \
    echo 'pacman-key --init' >> /refresh-keyring.sh && \
    echo 'pacman-key --populate' >> /refresh-keyring.sh && \
    echo 'pacman -Sy --noconfirm' >> /refresh-keyring.sh && \
    chmod +x /refresh-keyring.sh

# Kiểm tra file index.html
RUN test -f /app/public/index.html || (echo "ERROR: index.html not found!" && exit 1)

# Chuyển sang user archuser
USER archuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start script
CMD ["sh", "-c", "sudo /refresh-keyring.sh && node server.js"]
