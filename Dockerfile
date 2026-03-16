# Dockerfile - Arch Terminal Controller (Root User)
FROM archlinux:latest

# Cập nhật hệ thống và cài đặt packages
RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm \
    nodejs \
    npm \
    git \
    nginx \
    openssh \
    curl \
    wget \
    tmux \
    vim \
    htop \
    net-tools \
    && pacman -Scc --noconfirm

# Tạo thư mục làm việc
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy toàn bộ source code
COPY . .

# Cài đặt dependencies
RUN npm install -g npm@latest && \
    npm install

# Tạo thư mục cần thiết
RUN mkdir -p /var/log/nginx && \
    mkdir -p /app/logs && \
    mkdir -p /app/scripts && \
    mkdir -p /root/.ssh && \
    mkdir -p /data/terminal

# Cấu hình SSH
RUN ssh-keygen -A && \
    echo "root:arch123" | chpasswd && \
    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config

# Cấu hình Nginx
RUN echo 'server {\n\
    listen 80;\n\
    server_name localhost;\n\
    \n\
    location / {\n\
        root /app/public;\n\
        index index.html;\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
    \n\
    location /ws {\n\
        proxy_pass http://localhost:3000;\n\
        proxy_http_version 1.1;\n\
        proxy_set_header Upgrade $http_upgrade;\n\
        proxy_set_header Connection "upgrade";\n\
        proxy_set_header Host $host;\n\
    }\n\
    \n\
    location /api {\n\
        proxy_pass http://localhost:3000;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
    }\n\
}' > /etc/nginx/conf.d/terminal.conf

# Tạo file start.sh
RUN echo '#!/bin/bash' > /start.sh && \
    echo 'echo "========================================="' >> /start.sh && \
    echo 'echo "  Arch Terminal Controller - Root Mode  "' >> /start.sh && \
    echo 'echo "========================================="' >> /start.sh && \
    echo 'echo "Starting at: $(date)"' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Khởi động SSH' >> /start.sh && \
    echo 'echo "Starting SSH server..."' >> /start.sh && \
    echo '/usr/bin/sshd' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Khởi động Nginx' >> /start.sh && \
    echo 'echo "Starting Nginx..."' >> /start.sh && \
    echo 'nginx' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Khởi động Node.js server' >> /start.sh && \
    echo 'echo "Starting Node.js server..."' >> /start.sh && \
    echo 'cd /app' >> /start.sh && \
    echo 'node server.js > /app/logs/node.log 2>&1 &' >> /start.sh && \
    echo '' >> /start.sh && \
    echo 'echo ""' >> /start.sh && \
    echo 'echo "Services started successfully!"' >> /start.sh && \
    echo 'echo "-----------------------------------------"' >> /start.sh && \
    echo 'echo "Web Interface: http://localhost:80"' >> /start.sh && \
    echo 'echo "WebSocket: ws://localhost:3000"' >> /start.sh && \
    echo 'echo "SSH: ssh root@localhost -p 22"' >> /start.sh && \
    echo 'echo "-----------------------------------------"' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Giữ container chạy' >> /start.sh && \
    echo 'tail -f /app/logs/*.log' >> /start.sh && \
    chmod +x /start.sh

# Tạo file auto-deploy.sh
RUN echo '#!/bin/bash' > /app/scripts/auto-deploy.sh && \
    echo 'echo "[$(date)] Starting auto-deploy..."' >> /app/scripts/auto-deploy.sh && \
    echo '' >> /app/scripts/auto-deploy.sh && \
    echo '# Pull latest code (nếu có git)' >> /app/scripts/auto-deploy.sh && \
    echo 'if [ -d ".git" ]; then' >> /app/scripts/auto-deploy.sh && \
    echo '    echo "Pulling latest code..."' >> /app/scripts/auto-deploy.sh && \
    echo '    git pull origin main' >> /app/scripts/auto-deploy.sh && \
    echo 'fi' >> /app/scripts/auto-deploy.sh && \
    echo '' >> /app/scripts/auto-deploy.sh && \
    echo '# Cài đặt dependencies mới' >> /app/scripts/auto-deploy.sh && \
    echo 'echo "Installing dependencies..."' >> /app/scripts/auto-deploy.sh && \
    echo 'npm install' >> /app/scripts/auto-deploy.sh && \
    echo '' >> /app/scripts/auto-deploy.sh && \
    echo '# Restart services' >> /app/scripts/auto-deploy.sh && \
    echo 'echo "Restarting services..."' >> /app/scripts/auto-deploy.sh && \
    echo 'pkill node || true' >> /app/scripts/auto-deploy.sh && \
    echo 'node server.js > /app/logs/node.log 2>&1 &' >> /app/scripts/auto-deploy.sh && \
    echo 'nginx -s reload' >> /app/scripts/auto-deploy.sh && \
    echo '' >> /app/scripts/auto-deploy.sh && \
    echo 'echo "[$(date)] Auto-deploy completed!"' >> /app/scripts/auto-deploy.sh && \
    chmod +x /app/scripts/auto-deploy.sh

# Tạo file monitor.sh
RUN echo '#!/bin/bash' > /app/scripts/monitor.sh && \
    echo 'while true; do' >> /app/scripts/monitor.sh && \
    echo '    # CPU usage' >> /app/scripts/monitor.sh && \
    echo '    CPU=$(top -bn1 | grep "Cpu(s)" | awk "{print \$2}" | cut -d"%" -f1)' >> /app/scripts/monitor.sh && \
    echo '    ' >> /app/scripts/monitor.sh && \
    echo '    # Memory usage' >> /app/scripts/monitor.sh && \
    echo '    MEM=$(free | grep Mem | awk "{print \$3/\$2 * 100.0}")' >> /app/scripts/monitor.sh && \
    echo '    ' >> /app/scripts/monitor.sh && \
    echo '    # Disk usage' >> /app/scripts/monitor.sh && \
    echo '    DISK=$(df -h / | awk "NR==2 {print \$5}" | cut -d"%" -f1)' >> /app/scripts/monitor.sh && \
    echo '    ' >> /app/scripts/monitor.sh && \
    echo '    # Log to file' >> /app/scripts/monitor.sh && \
    echo '    echo "$(date -Iseconds),CPU:$CPU%,MEM:$MEM%,DISK:$DISK%" >> /app/logs/metrics.csv' >> /app/scripts/monitor.sh && \
    echo '    ' >> /app/scripts/monitor.sh && \
    echo '    sleep 60' >> /app/scripts/monitor.sh && \
    echo 'done' >> /app/scripts/monitor.sh && \
    chmod +x /app/scripts/monitor.sh

# Tạo file healthcheck
RUN echo '#!/bin/bash' > /usr/local/bin/healthcheck && \
    echo 'echo "Content-type: application/json"' >> /usr/local/bin/healthcheck && \
    echo 'echo ""' >> /usr/local/bin/healthcheck && \
    echo '' >> /usr/local/bin/healthcheck && \
    echo 'if pgrep node > /dev/null && pgrep nginx > /dev/null; then' >> /usr/local/bin/healthcheck && \
    echo '    echo "{\"status\":\"healthy\",\"timestamp\":\"$(date -Iseconds)\"}"' >> /usr/local/bin/healthcheck && \
    echo 'else' >> /usr/local/bin/healthcheck && \
    echo '    echo "{\"status\":\"unhealthy\",\"timestamp\":\"$(date -Iseconds)\"}"' >> /usr/local/bin/healthcheck && \
    echo '    exit 1' >> /usr/local/bin/healthcheck && \
    echo 'fi' >> /usr/local/bin/healthcheck && \
    chmod +x /usr/local/bin/healthcheck

# Expose ports
EXPOSE 80 443 3000 22

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV TERM=xterm

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Chạy với quyền root
USER root

# Start command
CMD ["/bin/bash", "/start.sh"]
