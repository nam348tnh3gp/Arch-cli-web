# Dockerfile - Arch Terminal Controller
FROM archlinux:latest

# Cập nhật hệ thống
RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm \
    nodejs \
    npm \
    curl \
    python \
    ffmpeg \
    && pacman -Scc --noconfirm

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

# Kiểm tra file index.html
RUN test -f /app/public/index.html || (echo "ERROR: index.html not found!" && exit 1)

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start server
CMD ["node", "server.js"]
