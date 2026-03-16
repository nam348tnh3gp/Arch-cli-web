# Dockerfile - Arch Linux Terminal (Fixed)
FROM archlinux:latest

# Cập nhật hệ thống và cài đặt packages cơ bản (chỉ những gói chắc chắn có)
RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm \
    # Core tools
    sudo \
    git \
    curl \
    wget \
    vim \
    nano \
    htop \
    neofetch \
    # Network tools
    net-tools \
    iputils \
    bind \
    traceroute \
    # System tools
    lsof \
    strace \
    # Programming languages
    nodejs \
    npm \
    python \
    python-pip \
    gcc \
    make \
    cmake \
    # Media tools
    ffmpeg \
    yt-dlp \
    # Archiving tools
    unzip \
    zip \
    tar \
    gzip \
    # Database clients (chỉ libs, không cần client đầy đủ)
    postgresql-libs \
    # Shell utilities
    zsh \
    tmux \
    screen \
    # Process management
    supervisor \
    && pacman -Scc --noconfirm

# Cài thêm các gói bổ sung bằng pip (cho Python)
RUN pip install --break-system-packages \
    youtube-dl \
    requests \
    beautifulsoup4

# Cấu hình sudo không cần password
RUN echo "root ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Tạo thư mục làm việc
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source code
COPY server.js ./
COPY public/ ./public/

# Tạo thư mục downloads
RUN mkdir -p /downloads /shared && \
    chmod 777 /downloads /shared

# Script init
RUN echo '#!/bin/bash' > /init.sh && \
    echo 'echo "=========================================="' >> /init.sh && \
    echo 'echo "  Arch Linux Terminal Starting..."' >> /init.sh && \
    echo 'echo "=========================================="' >> /init.sh && \
    echo '' >> /init.sh && \
    echo '# Fix pacman keyring' >> /init.sh && \
    echo 'pacman-key --init' >> /init.sh && \
    echo 'pacman-key --populate archlinux' >> /init.sh && \
    echo '' >> /init.sh && \
    echo '# Update package database' >> /init.sh && \
    echo 'pacman -Sy --noconfirm' >> /init.sh && \
    echo '' >> /init.sh && \
    echo '# Show system info' >> /init.sh && \
    echo 'echo "System: Arch Linux"' >> /init.sh && \
    echo 'echo "Kernel: $(uname -r)"' >> /init.sh && \
    echo 'echo "Node: $(node --version)"' >> /init.sh && \
    echo 'echo "npm: $(npm --version)"' >> /init.sh && \
    echo 'echo "Python: $(python --version)"' >> /init.sh && \
    echo '' >> /init.sh && \
    echo '# Start Node.js server' >> /init.sh && \
    echo 'cd /app' >> /init.sh && \
    echo 'exec node server.js' >> /init.sh && \
    chmod +x /init.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["/init.sh"]
