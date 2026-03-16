const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// IMPORTANT: Render yêu cầu dùng PORT từ env
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check cho Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Auto Yes function
function autoYes(command) {
    if (command.includes('pacman -S') && !command.includes('--noconfirm')) {
        return command + ' --noconfirm';
    }
    return command;
}

// Execute command
function executeCommand(command, ws) {
    const finalCommand = autoYes(command);
    
    const process = spawn('sh', ['-c', finalCommand], {
        cwd: '/root',
        env: { ...process.env, TERM: 'xterm' }
    });

    process.stdout.on('data', (data) => {
        ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
    });

    process.stderr.on('data', (data) => {
        ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
    });

    process.on('close', () => {
        ws.send(JSON.stringify({ type: 'output', data: '# ' }));
    });
}

// WebSocket
wss.on('connection', (ws) => {
    console.log('Client connected');
    
    ws.send(JSON.stringify({ type: 'output', data: '✅ Connected to Arch Linux\n' }));
    ws.send(JSON.stringify({ type: 'output', data: '📁 Current directory: /root\n' }));
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

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Public directory: ${path.join(__dirname, 'public')}`);
    
    // Kiểm tra file index.html
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        console.log('✅ index.html found');
    } else {
        console.error('❌ index.html NOT found!');
        process.exit(1);
    }
});
