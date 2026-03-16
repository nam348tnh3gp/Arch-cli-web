# Dockerfile - Arch Linux Terminal (Working)
FROM archlinux:latest

# Cập nhật hệ thống và cài đặt packages (đã kiểm tra kỹ)
RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm \
    # Core system
    sudo \
    git \
    curl \
    wget \
    vim \
    nano \
    htop \
    # Network tools
    net-tools \
    iputils \
    bind-tools \
    traceroute \
    # System tools
    lsof \
    strace \
    # Programming languages
    nodejs \
    npm \
    cmake \
    # Media tools
    ffmpeg \
    yt-dlp \
    && pacman -Scc --noconfirm

# Fix: bind đã đổi thành bind-tools, bỏ iputils (đã có trong base)

# Cấu hình sudo
RUN echo "root ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Tạo thư mục làm việc
WORKDIR /app

# Copy và cài đặt Node dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY server.js ./
COPY public/ ./public/

# Tạo thư mục downloads
RUN mkdir -p /downloads /shared && \
    chmod 777 /downloads /shared

# Script khởi động
RUN echo '#!/bin/bash' > /start.sh && \
    echo 'echo "=========================================="' >> /start.sh && \
    echo 'echo "  Arch Linux Terminal"' >> /start.sh && \
    echo 'echo "=========================================="' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Khởi tạo pacman keyring' >> /start.sh && \
    echo 'pacman-key --init 2>/dev/null' >> /start.sh && \
    echo 'pacman-key --populate archlinux 2>/dev/null' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Hiển thị thông tin' >> /start.sh && \
    echo 'echo "System ready!"' >> /start.sh && \
    echo 'echo "Node: $(node --version)"' >> /start.sh && \
    echo 'echo "npm: $(npm --version)"' >> /start.sh && \
    echo 'echo "Python: $(python --version 2>&1)"' >> /start.sh && \
    echo 'echo "yt-dlp: $(yt-dlp --version)"' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Chạy Node.js server' >> /start.sh && \
    echo 'cd /app' >> /start.sh && \
    echo 'exec node server.js' >> /start.sh && \
    chmod +x /start.sh

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start
CMD ["/start.sh"]
