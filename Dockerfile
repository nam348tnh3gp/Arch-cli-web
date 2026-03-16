# Dockerfile - Arch Terminal Controller (Fixed)
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

# Copy package.json
COPY package.json ./
RUN npm install

# Copy source code
COPY server.js ./
COPY public/ ./public/

# Cấu hình SSH
RUN ssh-keygen -A && \
    echo "root:arch123" | chpasswd && \
    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config

# Tạo file cấu hình Nginx bằng cách copy từ file có sẵn
RUN echo '# Arch Terminal Nginx Config' > /etc/nginx/conf.d/default.conf
RUN echo 'server {' >> /etc/nginx/conf.d/default.conf
RUN echo '    listen 80;' >> /etc/nginx/conf.d/default.conf
RUN echo '    server_name localhost;' >> /etc/nginx/conf.d/default.conf
RUN echo '' >> /etc/nginx/conf.d/default.conf
RUN echo '    location / {' >> /etc/nginx/conf.d/default.conf
RUN echo '        root /app/public;' >> /etc/nginx/conf.d/default.conf
RUN echo '        index index.html;' >> /etc/nginx/conf.d/default.conf
RUN echo '        try_files $uri $uri/ /index.html;' >> /etc/nginx/conf.d/default.conf
RUN echo '    }' >> /etc/nginx/conf.d/default.conf
RUN echo '' >> /etc/nginx/conf.d/default.conf
RUN echo '    location /ws {' >> /etc/nginx/conf.d/default.conf
RUN echo '        proxy_pass http://localhost:3000;' >> /etc/nginx/conf.d/default.conf
RUN echo '        proxy_http_version 1.1;' >> /etc/nginx/conf.d/default.conf
RUN echo '        proxy_set_header Upgrade $http_upgrade;' >> /etc/nginx/conf.d/default.conf
RUN echo '        proxy_set_header Connection "upgrade";' >> /etc/nginx/conf.d/default.conf
RUN echo '        proxy_set_header Host $host;' >> /etc/nginx/conf.d/default.conf
RUN echo '    }' >> /etc/nginx/conf.d/default.conf
RUN echo '}' >> /etc/nginx/conf.d/default.conf

# Tạo script start
RUN echo '#!/bin/bash' > /start.sh
RUN echo 'echo "Starting Arch Terminal Controller..."' >> /start.sh
RUN echo 'sshd' >> /start.sh
RUN echo 'nginx' >> /start.sh
RUN echo 'cd /app' >> /start.sh
RUN echo 'node server.js' >> /start.sh
RUN chmod +x /start.sh

# Expose ports
EXPOSE 80 3000 22

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start
CMD ["/start.sh"]
