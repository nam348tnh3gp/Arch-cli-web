# Dockerfile - Arch Terminal with AUR
FROM archlinux:latest

# Cài base-devel để build AUR
RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm \
    nodejs \
    npm \
    curl \
    wget \
    python \
    ffmpeg \
    git \
    base-devel \
    sudo \
    && pacman -Scc --noconfirm

# Tạo user để build AUR
RUN useradd -m builder && \
    echo "builder ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Cài yay (AUR helper)
RUN su - builder -c "git clone https://aur.archlinux.org/yay.git && \
    cd yay && makepkg -si --noconfirm"

# Cài fastfetch từ AUR
RUN su - builder -c "yay -S --noconfirm fastfetch"

# Xóa user builder (không cần nữa)
RUN userdel -r builder

# Tạo thư mục app
WORKDIR /app

# Copy và cài dependencies
COPY package.json ./
RUN npm install

COPY server.js ./
COPY public/ ./public/

# Cài yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

EXPOSE 3000

CMD ["node", "server.js"]
