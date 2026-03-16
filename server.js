const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        time: new Date().toISOString(),
        user: process.env.USER || 'root'
    });
});

// API stats
app.get('/api/stats', (req, res) => {
    try {
        const stats = {
            cpu: getCPUUsage(),
            cpuModel: os.cpus()[0]?.model || 'Unknown',
            cpuCores: os.cpus().length,
            ram: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(1),
            ramUsed: formatBytes(os.totalmem() - os.freemem()),
            ramTotal: formatBytes(os.totalmem()),
            disk: getDiskUsage(),
            diskUsed: getDiskUsed(),
            diskTotal: getDiskTotal(),
            ip: getLocalIP(),
            uptime: formatUptime(os.uptime()),
            processes: getProcessCount(),
            loadavg: os.loadavg()[0].toFixed(2)
        };
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper functions (giữ nguyên như cũ)
function getCPUUsage() {
    try {
        const cpus = os.cpus();
        let idle = 0, total = 0;
        cpus.forEach(cpu => {
            for (let type in cpu.times) {
                total += cpu.times[type];
            }
            idle += cpu.times.idle;
        });
        return ((1 - idle / total) * 100).toFixed(1);
    } catch { return '0'; }
}

function getDiskUsage() {
    try {
        const output = execSync('df -h / | tail -1').toString();
        return output.split(/\s+/)[4]?.replace('%', '') || '0';
    } catch { return '0'; }
}

function getDiskUsed() {
    try {
        const output = execSync('df -h / | tail -1').toString();
        return output.split(/\s+/)[2] || '0 GB';
    } catch { return '0 GB'; }
}

function getDiskTotal() {
    try {
        const output = execSync('df -h / | tail -1').toString();
        return output.split(/\s+/)[1] || '0 GB';
    } catch { return '0 GB'; }
}

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

function getProcessCount() {
    try {
        const output = execSync('ps aux | wc -l').toString();
        return parseInt(output) || 0;
    } catch { return 0; }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

// QUAN TRỌNG: KHÔNG DÙNG SUDO, chỉ thêm --noconfirm
function autoYes(command) {
    if (command.includes('pacman')) {
        if (!command.includes('--noconfirm')) {
            command = command + ' --noconfirm';
        }
        // KHÔNG thêm sudo vì đang chạy root
    }
    return command;
}

function executeCommand(command, ws) {
    console.log(`Executing as root: ${command}`);
    
    const finalCommand = autoYes(command);
    
    const process = spawn('sh', ['-c', finalCommand], {
        cwd: '/root', // Dùng root home
        env: { ...process.env, TERM: 'xterm' }
    });

    process.stdout.on('data', (data) => {
        ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
    });

    process.stderr.on('data', (data) => {
        ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
    });

    process.on('close', (code) => {
        ws.send(JSON.stringify({ type: 'output', data: '# ' }));
    });
}

// WebSocket
wss.on('connection', (ws) => {
    console.log('Client connected');
    
    ws.send(JSON.stringify({ type: 'output', data: '✅ Connected to Arch Linux (Root)\n' }));
    ws.send(JSON.stringify({ type: 'output', data: '📦 Pacman ready (auto --noconfirm)\n' }));
    ws.send(JSON.stringify({ type: 'output', data: '# ' }));

    // Gửi stats định kỳ
    const statsInterval = setInterval(() => {
        try {
            const stats = {
                cpu: getCPUUsage(),
                cpuModel: os.cpus()[0]?.model || 'Unknown',
                cpuCores: os.cpus().length,
                ram: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(1),
                ramUsed: formatBytes(os.totalmem() - os.freemem()),
                ramTotal: formatBytes(os.totalmem()),
                disk: getDiskUsage(),
                diskUsed: getDiskUsed(),
                diskTotal: getDiskTotal(),
                ip: getLocalIP(),
                uptime: formatUptime(os.uptime()),
                processes: getProcessCount(),
                loadavg: os.loadavg()[0].toFixed(2)
            };
            ws.send(JSON.stringify({ type: 'stats', stats }));
        } catch (error) {
            console.error('Stats error:', error);
        }
    }, 2000);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            if (data.type === 'command') {
                executeCommand(data.command, ws);
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'error', data: err.message }));
        }
    });

    ws.on('close', () => {
        clearInterval(statsInterval);
        console.log('Client disconnected');
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`👤 Running as: ${process.env.USER || 'root'}`);
});
