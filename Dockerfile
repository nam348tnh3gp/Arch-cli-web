# Dockerfile - Arch Terminal Controller (Root User)
FROM archlinux:latest

# Cập nhật hệ thống và cài đặt packages với quyền root
RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm \
    nodejs \
    npm \
    python \
    python-pip \
    git \
    nginx \
    supervisor \
    openssh \
    sudo \
    curl \
    wget \
    tmux \
    screen \
    vim \
    nano \
    htop \
    net-tools \
    iputils \
    bind-tools \
    && pacman -Scc --noconfirm

# Tạo thư mục làm việc
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY public/ ./public/
COPY server.js ./
COPY nginx.conf /etc/nginx/nginx.conf
COPY supervisord.conf /etc/supervisord.conf

# Cài đặt dependencies với quyền root
RUN npm install -g npm@latest && \
    npm install express ws socket.io http-proxy-middleware compression helmet cors && \
    npm install

# Tạo thư mục cần thiết
RUN mkdir -p /var/log/supervisor && \
    mkdir -p /var/log/nginx && \
    mkdir -p /app/logs && \
    mkdir -p /app/scripts && \
    mkdir -p /root/.ssh && \
    mkdir -p /data/terminal

# Copy scripts
COPY scripts/ /app/scripts/
RUN chmod +x /app/scripts/*.sh

# Cấu hình SSH cho root
RUN ssh-keygen -A && \
    echo "root:arch123" | chpasswd && \
    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config

# Cấu hình Nginx
RUN echo 'server {
    listen 80;
    server_name localhost;
    
    location / {
        root /app/public;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
    
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
    
    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}' > /etc/nginx/conf.d/terminal.conf

# Tạo script khởi động tự động
RUN echo '#!/bin/bash
echo "========================================="
echo "  Arch Terminal Controller - Root Mode  "
echo "========================================="
echo "Starting at: $(date)"
echo ""

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

# Khởi động monitor
echo "Starting monitor..."
/app/scripts/monitor.sh > /app/logs/monitor.log 2>&1 &

# Hiển thị thông tin
echo ""
echo "Services started successfully!"
echo "-----------------------------------------"
echo "Web Interface: http://localhost:80"
echo "WebSocket: ws://localhost:3000"
echo "SSH: ssh root@localhost -p 22"
echo "-----------------------------------------"
echo ""
echo "System Information:"
echo "- Hostname: $(hostname)"
echo "- Architecture: $(uname -m)"
echo "- Kernel: $(uname -r)"
echo "- CPUs: $(nproc)"
echo "- Memory: $(free -h | grep Mem | awk "{print \$2}")"
echo "- Disk: $(df -h / | awk "NR==2 {print \$2}")"
echo ""
echo "Logs directory: /app/logs"
echo "========================================="

# Giữ container chạy
tail -f /app/logs/*.log' > /start.sh && chmod +x /start.sh

# Script auto-deploy cho Render
RUN echo '#!/bin/bash
# Auto-deploy script cho Render
echo "[$(date)] Starting auto-deploy..."

# Pull latest code (nếu dùng git)
if [ -d ".git" ]; then
    echo "Pulling latest code..."
    git pull origin main
fi

# Cài đặt dependencies mới
echo "Installing dependencies..."
npm install

# Restart services
echo "Restarting services..."
pkill node
node server.js > /app/logs/node.log 2>&1 &
nginx -s reload

# Kiểm tra health
sleep 5
if curl -s http://localhost:3000/health > /dev/null; then
    echo "Health check: OK"
else
    echo "Health check: FAILED"
    exit 1
fi

echo "[$(date)] Auto-deploy completed!"' > /app/scripts/auto-deploy.sh && chmod +x /app/scripts/auto-deploy.sh

# Script monitor system
RUN echo '#!/bin/bash
while true; do
    # CPU usage
    CPU=$(top -bn1 | grep "Cpu(s)" | awk "{print \$2}" | cut -d"%" -f1)
    
    # Memory usage
    MEM=$(free | grep Mem | awk "{print \$3/\$2 * 100.0}")
    
    # Disk usage
    DISK=$(df -h / | awk "NR==2 {print \$5}" | cut -d"%" -f1)
    
    # Process count
    PROCS=$(ps aux | wc -l)
    
    # Log to file
    echo "$(date -Iseconds),CPU:$CPU%,MEM:$MEM%,DISK:$DISK%,PROCS:$PROCS" >> /app/logs/metrics.csv
    
    # Alert if high usage
    if (( $(echo "$CPU > 90" | bc -l) )); then
        echo "WARNING: High CPU usage: $CPU%" >> /app/logs/alerts.log
    fi
    
    if (( $(echo "$MEM > 90" | bc -l) )); then
        echo "WARNING: High memory usage: $MEM%" >> /app/logs/alerts.log
    fi
    
    if [ $DISK -gt 90 ]; then
        echo "WARNING: High disk usage: $DISK%" >> /app/logs/alerts.log
    fi
    
    sleep 60
done' > /app/scripts/monitor.sh && chmod +x /app/scripts/monitor.sh

# Script backup
RUN echo '#!/bin/bash
BACKUP_DIR=/app/backups
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup logs
tar -czf $BACKUP_DIR/logs_$DATE.tar.gz /app/logs/

# Backup configs
tar -czf $BACKUP_DIR/configs_$DATE.tar.gz /etc/nginx/ /app/server.js

# Remove old backups (keep 7 days)
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE" >> /app/logs/backup.log' > /app/scripts/backup.sh && chmod +x /app/scripts/backup.sh

# Script tự động restart khi crash
RUN echo '#!/bin/bash
while true; do
    if ! pgrep -x "node" > /dev/null; then
        echo "$(date): Node.js crashed, restarting..." >> /app/logs/auto-restart.log
        cd /app && node server.js >> /app/logs/node.log 2>&1 &
    fi
    
    if ! pgrep -x "nginx" > /dev/null; then
        echo "$(date): Nginx crashed, restarting..." >> /app/logs/auto-restart.log
        nginx
    fi
    
    sleep 10
done' > /app/scripts/auto-restart.sh && chmod +x /app/scripts/auto-restart.sh

# Script cài đặt tự động cho Render
RUN echo '#!/bin/bash
# Render auto-install script
echo "=== Render Auto-Install ==="

# Cài đặt environment variables
export NODE_ENV=production
export PORT=3000

# Tạo thư mục data
mkdir -p /data/terminal/sessions

# Khởi động services
/start.sh

# Setup cron jobs (nếu có)
echo "0 */6 * * * /app/scripts/backup.sh" | crontab -

echo "Installation completed!"' > /app/scripts/render-install.sh && chmod +x /app/scripts/render-install.sh

# Health check endpoint
RUN echo '#!/bin/bash
echo "Content-type: application/json"
echo ""

if pgrep node > /dev/null && pgrep nginx > /dev/null; then
    echo "{\"status\":\"healthy\",\"timestamp\":\"$(date -Iseconds)\",\"uptime\":\"$(uptime -p)\"}"
else
    echo "{\"status\":\"unhealthy\",\"timestamp\":\"$(date -Iseconds)\"}"
    exit 1
fi' > /usr/local/bin/healthcheck && chmod +x /usr/local/bin/healthcheck

# Expose ports
EXPOSE 80 443 3000 22 8080

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV TERM=xterm
ENV LANG=en_US.UTF-8

# Volumes
VOLUME ["/app/logs", "/app/backups", "/data"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Chạy với quyền root
USER root

# Start command
CMD ["/start.sh"]
