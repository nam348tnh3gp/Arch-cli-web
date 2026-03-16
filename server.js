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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        time: new Date().toISOString(),
        uptime: os.uptime()
    });
});

// API lấy system stats
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
            diskUsed: '0 GB',
            diskTotal: '0 GB',
            netDown: '0 KB/s',
            netUp: '0 KB/s',
            ip: getLocalIP(),
            wifi: 'Arch-Render',
            uptime: formatUptime(os.uptime()),
            processes: getProcessCount(),
            temp: '45°C',
            loadavg: os.loadavg()[0].toFixed(2)
        };
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper functions
function getCPUUsage() {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    cpus.forEach(cpu => {
        for (type in cpu.times) {
            total += cpu.times[type];
        }
        idle += cpu.times.idle;
    });
    return ((1 - idle / total) * 100).toFixed(1);
}

function getDiskUsage() {
    try {
        const { execSync } = require('child_process');
        const output = execSync('df -h / | tail -1').toString();
        const parts = output.split(/\s+/);
        return parts[4]?.replace('%', '') || '0';
    } catch {
        return '0';
    }
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
        const { execSync } = require('child_process');
        const output = execSync('ps aux | wc -l').toString();
        return parseInt(output) || 0;
    } catch {
        return 0;
    }
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

// Auto Yes function
function autoYes(command) {
    if (command.includes('pacman -S') && !command.includes('--noconfirm')) {
        return command + ' --noconfirm';
    }
    return command;
}

// Execute command
function executeCommand(command, ws) {
    console.log(`Executing: ${command}`);
    
    const finalCommand = autoYes(command);
    
    const process = spawn('sh', ['-c', finalCommand], {
        cwd: '/root',
        env: { ...process.env, TERM: 'xterm' }
    });

    let output = '';
    
    process.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        ws.send(JSON.stringify({ type: 'output', data: text }));
    });

    process.stderr.on('data', (data) => {
        const text = data.toString();
        output += text;
        ws.send(JSON.stringify({ type: 'output', data: text }));
    });

    process.on('close', (code) => {
        if (code !== 0 && !output) {
            ws.send(JSON.stringify({ type: 'output', data: `Command exited with code ${code}\n` }));
        }
        ws.send(JSON.stringify({ type: 'output', data: '# ' }));
    });

    process.on('error', (err) => {
        ws.send(JSON.stringify({ type: 'error', data: err.message }));
    });
}

// WebSocket connection
wss.on('connection', (ws) => {
    console.log('Client connected');
    
    ws.send(JSON.stringify({ type: 'output', data: '✅ Connected to Arch Linux\n' }));
    ws.send(JSON.stringify({ type: 'output', data: '📊 Real-time system monitoring active\n' }));
    ws.send(JSON.stringify({ type: 'output', data: '# ' }));

    // Gửi stats định kỳ qua WebSocket
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
                diskUsed: '0 GB',
                diskTotal: '0 GB',
                netDown: '0 KB/s',
                netUp: '0 KB/s',
                ip: getLocalIP(),
                wifi: 'Arch-Render-5G',
                uptime: formatUptime(os.uptime()),
                processes: getProcessCount(),
                temp: '45°C',
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
            console.error('Error processing message:', err);
            ws.send(JSON.stringify({ type: 'error', data: err.message }));
        }
    });

    ws.on('close', () => {
        clearInterval(statsInterval);
        console.log('Client disconnected');
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================`);
    console.log(`Arch Terminal Pro Started`);
    console.log(`=================================`);
    console.log(`Port: ${PORT}`);
    console.log(`Public directory: ${path.join(__dirname, 'public')}`);
    console.log(`Node version: ${process.version}`);
    console.log(`OS: ${os.platform()} ${os.release()}`);
    console.log(`CPU: ${os.cpus()[0]?.model}`);
    console.log(`Memory: ${formatBytes(os.totalmem())}`);
    console.log(`=================================`);
    
    // Kiểm tra file index.html
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        console.log(`✅ index.html found`);
    } else {
        console.error(`❌ index.html NOT found at: ${indexPath}`);
        process.exit(1);
    }
});

// Error handlers
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});
