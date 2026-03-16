# Dockerfile - Arch Linux Full Terminal
FROM archlinux:latest

# Cập nhật hệ thống và cài đặt packages cần thiết
RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm \
    # Core tools
    base \
    base-devel \
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
    bind-tools \
    traceroute \
    iperf3 \
    # System tools
    lsof \
    strace \
    ltrace \
    gdb \
    valgrind \
    # Programming languages
    nodejs \
    npm \
    python \
    python-pip \
    ruby \
    perl \
    gcc \
    g++ \
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
    p7zip \
    # Database clients
    postgresql-libs \
    mariadb-clients \
    redis \
    # Shell utilities
    zsh \
    fish \
    tmux \
    screen \
    # Process management
    supervisor \
    && pacman -Scc --noconfirm

# Cấu hình sudo không cần password cho root (tránh lỗi)
RUN echo "root ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Tạo thư mục làm việc
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source code
COPY server.js ./
COPY public/ ./public/

# Tạo thư mục downloads và shared
RUN mkdir -p /downloads /shared /home/archuser && \
    chmod 777 /downloads /shared

# Tạo script init system
RUN echo '#!/bin/bash' > /init.sh && \
    echo 'echo "=========================================="' >> /init.sh && \
    echo 'echo "  Arch Linux Full Terminal Starting..."   "' >> /init.sh && \
    echo 'echo "=========================================="' >> /init.sh && \
    echo '' >> /init.sh && \
    echo '# Fix pacman keyring' >> /init.sh && \
    echo 'echo "🔑 Initializing pacman keyring..."' >> /init.sh && \
    echo 'pacman-key --init' >> /init.sh && \
    echo 'pacman-key --populate archlinux' >> /init.sh && \
    echo '' >> /init.sh && \
    echo '# Update package database' >> /init.sh && \
    echo 'echo "📦 Updating package database..."' >> /init.sh && \
    echo 'pacman -Sy --noconfirm' >> /init.sh && \
    echo '' >> /init.sh && \
    echo '# Show system info' >> /init.sh && \
    echo 'echo "System Information:"' >> /init.sh && \
    echo 'echo "  OS: Arch Linux"' >> /init.sh && \
    echo 'echo "  Kernel: $(uname -r)"' >> /init.sh && \
    echo 'echo "  Architecture: $(uname -m)"' >> /init.sh && \
    echo 'echo "  CPU: $(nproc) cores"' >> /init.sh && \
    echo 'echo "  Memory: $(free -h | grep Mem | awk "{print \$2}")"' >> /init.sh && \
    echo 'echo "  Disk: $(df -h / | awk "NR==2 {print \$2}")"' >> /init.sh && \
    echo '' >> /init.sh && \
    echo '# Start Node.js server' >> /init.sh && \
    echo 'echo "🚀 Starting Node.js server..."' >> /init.sh && \
    echo 'cd /app' >> /init.sh && \
    echo 'exec node server.js' >> /init.sh && \
    chmod +x /init.sh

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start
CMD ["/init.sh"]
