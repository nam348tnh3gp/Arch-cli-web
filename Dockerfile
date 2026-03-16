# Dockerfile - Fixed version
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

# Tạo user để build AUR packages
RUN useradd -m builder && \
    echo "builder ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Cài đặt yay (AUR helper)
RUN su - builder -c "git clone https://aur.archlinux.org/yay.git && \
    cd yay && makepkg -si --noconfirm"

# Cài fastfetch từ AUR
RUN su - builder -c "yay -S --noconfirm fastfetch"

# Hoặc cài neofetch (vẫn còn trong AUR)
RUN su - builder -c "yay -S --noconfirm neofetch"

# Cài yt-dlp từ GitHub (bản mới nhất)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Tạo alias
RUN echo 'alias neofetch="fastfetch"' >> /root/.bashrc && \
    echo 'alias pacman="pacman --noconfirm"' >> /root/.bashrc
