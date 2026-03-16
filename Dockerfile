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

# Cấu hình Nginx - SỬA LỖI Ở ĐÂY
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    location / { \
        root /app/public; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
    location /ws { \
        proxy_pass http://localhost:3000; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host $host; \
    } \
    location /api { \
        proxy_pass http://localhost:3000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
    } \
}' > /etc/nginx/conf.d/terminal.conf

# Script khởi động
RUN echo '#!/bin/bash
echo "========================================="
echo "  Arch Terminal Controller - Root Mode  "
echo "========================================="
echo "Starting at: $(date)"

# Khởi động SSH
echo "Starting SSH server..."
/usr/bin/sshd

# Khởi động Nginx
echo "Starting Nginx..."
nginx

# Khởi động Node.js server
echo "Starting Node.js server..."
cd /app
node server.js > /app/logs/node.log 2>&1 &

echo ""
echo "Services started successfully!"
echo "-----------------------------------------"
echo "Web Interface: http://localhost:80"
echo "WebSocket: ws://localhost:3000"
echo "SSH: ssh root@localhost -p 22"
echo "-----------------------------------------"

# Giữ container chạy
tail -f /app/logs/*.log' > /start.sh && chmod +x /start.sh

# Script auto-deploy
RUN echo '#!/bin/bash
echo "[$(date)] Starting auto-deploy..."

# Pull latest code (nếu có git)
if [ -d ".git" ]; then
    echo "Pulling latest code..."
    git pull origin main
fi

# Cài đặt dependencies mới
echo "Installing dependencies..."
npm install

# Restart services
echo "Restarting services..."
pkill node || true
node server.js > /app/logs/node.log 2>&1 &
nginx -s reload

echo "[$(date)] Auto-deploy completed!"' > /app/scripts/auto-deploy.sh && chmod +x /app/scripts/auto-deploy.sh

# Script monitor
RUN echo '#!/bin/bash
while true; do
    # CPU usage
    CPU=$(top -bn1 | grep "Cpu(s)" | awk "{print \$2}" | cut -d"%" -f1)
    
    # Memory usage
    MEM=$(free | grep Mem | awk "{print \$3/\$2 * 100.0}")
    
    # Disk usage
    DISK=$(df -h / | awk "NR==2 {print \$5}" | cut -d"%" -f1)
    
    # Log to file
    echo "$(date -Iseconds),CPU:$CPU%,MEM:$MEM%,DISK:$DISK%" >> /app/logs/metrics.csv
    
    sleep 60
done' > /app/scripts/monitor.sh && chmod +x /app/scripts/monitor.sh

# Script health check
RUN echo '#!/bin/bash
echo "Content-type: application/json"
echo ""

if pgrep node > /dev/null && pgrep nginx > /dev/null; then
    echo "{\"status\":\"healthy\",\"timestamp\":\"$(date -Iseconds)\"}"
else
    echo "{\"status\":\"unhealthy\",\"timestamp\":\"$(date -Iseconds)\"}"
    exit 1
fi' > /usr/local/bin/healthcheck && chmod +x /usr/local/bin/healthcheck

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
