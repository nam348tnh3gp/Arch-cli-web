const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn, execSync } = require('child_process');
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
    res.json({
        status: 'ok',
        time: new Date().toISOString(),
        hostname: os.hostname(),
        uptime: os.uptime()
    });
});

// API endpoint để chạy lệnh (cho các lệnh đặc biệt)
app.post('/api/exec', express.json(), (req, res) => {
    const { command } = req.body;
    try {
        const output = execSync(command, { 
            encoding: 'utf8',
            timeout: 10000,
            shell: '/bin/bash'
        });
        res.json({ output });
    } catch (error) {
        res.json({ output: error.message });
    }
});

// WebSocket cho terminal real-time
wss.on('connection', (ws) => {
    console.log('Client connected');
    
    // Welcome message
    ws.send(JSON.stringify({ 
        type: 'output', 
        data: '\x1b[32m' + // Green color
            '==========================================\n' +
            '  Arch Linux Full Terminal\n' +
            '==========================================\n' +
            '  ✓ All system commands available\n' +
            '  ✓ pacman works (auto --noconfirm)\n' +
            '  ✓ yt-dlp ready\n' +
            '  ✓ Full development tools\n' +
            '==========================================\n' +
            '\x1b[0m' // Reset color
    }));
    ws.send(JSON.stringify({ type: 'output', data: '# ' }));

    // Xử lý lệnh
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'command') {
                executeCommand(data.command, ws);
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'error', data: err.message }));
        }
    });
});

// Execute command với đầy đủ quyền
function executeCommand(command, ws) {
    console.log(`Executing: ${command}`);
    
    // Tự động thêm --noconfirm cho pacman
    let finalCommand = command;
    if (command.includes('pacman -S') && !command.includes('--noconfirm')) {
        finalCommand = command + ' --noconfirm';
    }
    
    // Spawn process với shell đầy đủ
    const process = spawn('/bin/bash', ['-c', finalCommand], {
        cwd: '/root',
        env: { 
            ...process.env, 
            TERM: 'xterm-256color',
            PS1: '\\u@\\h:\\w\\$ ',
            PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
        }
    });

    // Handle output
    process.stdout.on('data', (data) => {
        ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
    });

    process.stderr.on('data', (data) => {
        ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
    });

    process.on('close', (code) => {
        ws.send(JSON.stringify({ type: 'output', data: '# ' }));
    });

    process.on('error', (err) => {
        ws.send(JSON.stringify({ type: 'error', data: err.message }));
    });
}

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log('==========================================');
    console.log('Arch Linux Full Terminal');
    console.log('==========================================');
    console.log(`Port: ${PORT}`);
    console.log(`Node: ${process.version}`);
    console.log(`Hostname: ${os.hostname()}`);
    console.log(`Platform: ${os.platform()} ${os.arch()}`);
    console.log(`CPUs: ${os.cpus().length}`);
    console.log(`Memory: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`);
    console.log('==========================================');
});
