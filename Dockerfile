# Dockerfile - Arch Terminal Controller
FROM archlinux:latest

# Cập nhật hệ thống
RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm \
    nodejs \
    npm \
    nginx \
    openssh \
    curl \
    && pacman -Scc --noconfirm

# Tạo thư mục làm việc
WORKDIR /app

# Copy package.json trước để tận dụng cache
COPY package.json ./
COPY package-lock.json* ./

# Cài đặt dependencies
RUN npm install

# Copy source code
COPY server.js ./
COPY public/ ./public/

# Cấu hình SSH
RUN ssh-keygen -A && \
    echo "root:arch123" | chpasswd && \
    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config

# Cấu hình Nginx đơn giản
RUN echo "server {" > /etc/nginx/conf.d/default.conf && \
    echo "    listen 80;" >> /etc/nginx/conf.d/default.conf && \
    echo "    server_name localhost;" >> /etc/nginx/conf.d/default.conf && \
    echo "    location / {" >> /etc/nginx/conf.d/default.conf && \
    echo "        root /app/public;" >> /etc/nginx/conf.d/default.conf && \
    echo "        index index.html;" >> /etc/nginx/conf.d/default.conf && \
    echo "        try_files \$uri \$uri/ /index.html;" >> /etc/nginx/conf.d/default.conf && \
    echo "    }" >> /etc/nginx/conf.d/default.conf && \
    echo "    location /ws {" >> /etc/nginx/conf.d/default.conf && \
    echo "        proxy_pass http://localhost:3000;" >> /etc/nginx/conf.d/default.conf && \
    echo "        proxy_http_version 1.1;" >> /etc/nginx/conf.d/default.conf && \
    echo "        proxy_set_header Upgrade \$http_upgrade;" >> /etc/nginx/conf.d/default.conf && \
    echo "        proxy_set_header Connection 'upgrade';" >> /etc/nginx/conf.d/default.conf && \
    echo "        proxy_set_header Host \$host;" >> /etc/nginx/conf.d/default.conf && \
    echo "    }" >> /etc/nginx/conf.d/default.conf && \
    echo "}" >> /etc/nginx/conf.d/default.conf

# Tạo script start
RUN echo '#!/bin/bash' > /start.sh && \
    echo 'echo "Starting Arch Terminal Controller..."' >> /start.sh && \
    echo 'sshd' >> /start.sh && \
    echo 'nginx' >> /start.sh && \
    echo 'cd /app' >> /start.sh && \
    echo 'node server.js' >> /start.sh && \
    chmod +x /start.sh

# Expose ports
EXPOSE 80 3000 22

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start
CMD ["/start.sh"]
