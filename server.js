// Khai báo tất cả imports ở đầu file
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');

// Khởi tạo app sau khi đã import xong
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Lấy PORT sau khi đã khởi tạo xong
const PORT = process.env.PORT || 3000;

// Kiểm tra process đã sẵn sàng
if (!process || !process.env) {
    throw new Error('Process not initialized properly');
}

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

// API endpoint cho system info
app.post('/api/exec', express.json(), (req, res) => {
    const { command } = req.body;
    try {
        const output = execSync(command, { 
            encoding: 'utf8',
            timeout: 5000,
            shell: '/bin/bash'
        });
        res.json({ output });
    } catch (error) {
        res.json({ output: error.message });
    }
});

// WebSocket cho terminal
wss.on('connection', (ws) => {
    console.log('Client connected');
    
    ws.send(JSON.stringify({ 
        type: 'output', 
        data: '==========================================\n' +
              '  Arch Linux Terminal\n' +
              '==========================================\n'
    }));
    ws.send(JSON.stringify({ type: 'output', data: '# ' }));

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

function executeCommand(command, ws) {
    console.log(`Executing: ${command}`);
    
    // Auto --noconfirm cho pacman
    let finalCommand = command;
    if (command.includes('pacman -S') && !command.includes('--noconfirm')) {
        finalCommand = command + ' --noconfirm';
    }
    
    const proc = spawn('/bin/bash', ['-c', finalCommand], {
        env: { ...process.env, TERM: 'xterm' }
    });

    proc.stdout.on('data', (data) => {
        ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
    });

    proc.stderr.on('data', (data) => {
        ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
    });

    proc.on('close', () => {
        ws.send(JSON.stringify({ type: 'output', data: '# ' }));
    });
}

// Start server - đảm bảo mọi thứ đã sẵn sàng
server.listen(PORT, '0.0.0.0', () => {
    console.log('==========================================');
    console.log('Server started successfully');
    console.log('==========================================');
    console.log(`Port: ${PORT}`);
    console.log(`Node: ${process.version}`);
    console.log(`PID: ${process.pid}`);
    console.log('==========================================');
});
