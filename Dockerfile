# Dockerfile - Arch Terminal Controller (Fixed)
FROM archlinux:latest

# Cập nhật hệ thống và cài đặt packages cơ bản
RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm \
    nodejs \
    npm \
    nginx \
    openssh \
    curl \
    wget \
    python \
    ffmpeg \
    git \
    sudo \
    base-devel \
    && pacman -Scc --noconfirm

# Tạo file cấu hình pacman đúng
RUN echo "[options]" > /etc/pacman.conf && \
    echo "HoldPkg = pacman glibc" >> /etc/pacman.conf && \
    echo "Architecture = auto" >> /etc/pacman.conf && \
    echo "Color" >> /etc/pacman.conf && \
    echo "CheckSpace" >> /etc/pacman.conf && \
    echo "ParallelDownloads = 5" >> /etc/pacman.conf && \
    echo "" >> /etc/pacman.conf && \
    echo "[core]" >> /etc/pacman.conf && \
    echo "Include = /etc/pacman.d/mirrorlist" >> /etc/pacman.conf && \
    echo "" >> /etc/pacman.conf && \
    echo "[extra]" >> /etc/pacman.conf && \
    echo "Include = /etc/pacman.d/mirrorlist" >> /etc/pacman.conf && \
    echo "" >> /etc/pacman.conf && \
    echo "[community]" >> /etc/pacman.conf && \
    echo "Include = /etc/pacman.d/mirrorlist" >> /etc/pacman.conf

# Cài fastfetch (thay thế cho neofetch)
RUN pacman -S --noconfirm fastfetch

# Tạo alias cho bash
RUN echo 'alias pacman="pacman --noconfirm"' >> /root/.bashrc && \
    echo 'alias update="pacman -Syu --noconfirm"' >> /root/.bashrc && \
    echo 'alias install="pacman -S --noconfirm"' >> /root/.bashrc && \
    echo 'alias neofetch="fastfetch"' >> /root/.bashrc && \
    echo 'alias ff="fastfetch"' >> /root/.bashrc && \
    echo 'alias yt="yt-dlp"' >> /root/.bashrc

# Cài yt-dlp bản mới nhất từ GitHub
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Tạo function cho yt-dlp
RUN echo 'yt-mp3() { yt-dlp -x --audio-format mp3 "$1"; }' >> /root/.bashrc && \
    echo 'yt-best() { yt-dlp -f best "$1"; }' >> /root/.bashrc && \
    echo 'yt-list() { yt-dlp -F "$1"; }' >> /root/.bashrc && \
    echo 'yt-playlist() { yt-dlp -f best --yes-playlist "$1"; }' >> /root/.bashrc

# Kiểm tra phiên bản
RUN yt-dlp --version && fastfetch --version

# Tạo thư mục downloads
RUN mkdir -p /downloads && \
    chmod 777 /downloads

# Tạo thư mục cần thiết
RUN mkdir -p /etc/nginx/conf.d && \
    mkdir -p /run/nginx && \
    mkdir -p /var/log/nginx && \
    mkdir -p /app/public && \
    mkdir -p /app/logs && \
    mkdir -p /app/scripts

# Tạo thư mục làm việc
WORKDIR /app

# Copy package.json
COPY package.json ./
RUN npm install

# Copy source code
COPY server.js ./
COPY public/index.html ./public/

# Cấu hình SSH
RUN ssh-keygen -A && \
    echo "root:arch123" | chpasswd && \
    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PermitEmptyPasswords no/PermitEmptyPasswords no/' /etc/ssh/sshd_config

# Cấu hình Nginx
RUN echo '# Arch Terminal Nginx Config' > /etc/nginx/conf.d/default.conf && \
    echo 'server {' >> /etc/nginx/conf.d/default.conf && \
    echo '    listen 80;' >> /etc/nginx/conf.d/default.conf && \
    echo '    server_name localhost;' >> /etc/nginx/conf.d/default.conf && \
    echo '' >> /etc/nginx/conf.d/default.conf && \
    echo '    location / {' >> /etc/nginx/conf.d/default.conf && \
    echo '        root /app/public;' >> /etc/nginx/conf.d/default.conf && \
    echo '        index index.html;' >> /etc/nginx/conf.d/default.conf && \
    echo '        try_files $uri $uri/ /index.html;' >> /etc/nginx/conf.d/default.conf && \
    echo '    }' >> /etc/nginx/conf.d/default.conf && \
    echo '' >> /etc/nginx/conf.d/default.conf && \
    echo '    location /ws {' >> /etc/nginx/conf.d/default.conf && \
    echo '        proxy_pass http://localhost:3000;' >> /etc/nginx/conf.d/default.conf && \
    echo '        proxy_http_version 1.1;' >> /etc/nginx/conf.d/default.conf && \
    echo '        proxy_set_header Upgrade $http_upgrade;' >> /etc/nginx/conf.d/default.conf && \
    echo '        proxy_set_header Connection "upgrade";' >> /etc/nginx/conf.d/default.conf && \
    echo '        proxy_set_header Host $host;' >> /etc/nginx/conf.d/default.conf && \
    echo '    }' >> /etc/nginx/conf.d/default.conf && \
    echo '}' >> /etc/nginx/conf.d/default.conf

# Tạo script thông báo
RUN echo '#!/bin/bash' > /etc/profile.d/motd.sh && \
    echo 'echo "=========================================="' >> /etc/profile.d/motd.sh && \
    echo 'echo "  Arch Terminal Controller - Ready"       ' >> /etc/profile.d/motd.sh && \
    echo 'echo "=========================================="' >> /etc/profile.d/motd.sh && \
    echo 'echo "  📦 Pacman: --noconfirm auto"           ' >> /etc/profile.d/motd.sh && \
    echo 'echo "  📥 yt-dlp: $(yt-dlp --version)"        ' >> /etc/profile.d/motd.sh && \
    echo 'echo "  🚀 Fastfetch: $(fastfetch --version)"  ' >> /etc/profile.d/motd.sh && \
    echo 'echo "=========================================="' >> /etc/profile.d/motd.sh && \
    chmod +x /etc/profile.d/motd.sh

# Tạo script start
RUN echo '#!/bin/bash' > /start.sh && \
    echo 'echo "========================================="' >> /start.sh && \
    echo 'echo "  Arch Terminal Controller Starting...   "' >> /start.sh && \
    echo 'echo "========================================="' >> /start.sh && \
    echo 'echo "📦 Pacman: Auto Yes (--noconfirm)"' >> /start.sh && \
    echo 'echo "📥 yt-dlp version: $(yt-dlp --version)"' >> /start.sh && \
    echo 'echo "========================================="' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Source bashrc' >> /start.sh && \
    echo 'source /root/.bashrc' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Start SSH' >> /start.sh && \
    echo 'echo "🔌 Starting SSH server on port 22..."' >> /start.sh && \
    echo '/usr/bin/sshd' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Start Nginx' >> /start.sh && \
    echo 'echo "🌐 Starting Nginx on port 80..."' >> /start.sh && \
    echo 'nginx -g "daemon off;" &' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Start Node.js' >> /start.sh && \
    echo 'echo "⚙️  Starting Node.js server on port 3000..."' >> /start.sh && \
    echo 'cd /app' >> /start.sh && \
    echo 'node server.js' >> /start.sh && \
    chmod +x /start.sh

# Expose ports
EXPOSE 80 3000 22

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Tạo volume cho downloads
VOLUME ["/downloads", "/app/logs"]

# Start
CMD ["/bin/bash", "/start.sh"]
