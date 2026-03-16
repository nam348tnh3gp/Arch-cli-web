// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Tạo thư mục logs nếu chưa có
const logDir = '/app/logs';
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logFile = fs.createWriteStream(path.join(logDir, 'terminal.log'), { flags: 'a' });

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        user: process.env.USER,
        uid: process.getuid(),
        uptime: os.uptime()
    });
});

// System info endpoint
app.get('/api/system', (req, res) => {
    const info = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        cpus: os.cpus().length,
        memory: {
            total: os.totalmem(),
            free: os.freemem()
        },
        uptime: os.uptime()
    };
    res.json(info);
});

// Execute command
function executeCommand(command, callback) {
    console.log(`Executing: ${command}`);
    
    // Blacklist dangerous commands
    const dangerous = ['rm -rf /', 'mkfs', 'dd if=', '>:'];
    if (dangerous.some(cmd => command.includes(cmd))) {
        callback('Error: Dangerous command blocked for safety');
        return;
    }
    
    exec(command, {
        cwd: '/root',
        timeout: 30000,
        maxBuffer: 1024 * 1024
    }, (error, stdout, stderr) => {
        if (error) {
            callback(`Error: ${error.message}`);
        } else {
            callback(stdout || stderr);
        }
    });
}

// WebSocket connection
wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`Client connected: ${clientIp}`);
    
    // Send welcome message
    ws.send(JSON.stringify({
        type: 'system',
        data: {
            message: 'Connected to Arch Linux',
            user: 'root',
            hostname: os.hostname()
        }
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch(data.type) {
                case 'command':
                    executeCommand(data.command, (output) => {
                        ws.send(JSON.stringify({
                            type: 'output',
                            data: output
                        }));
                    });
                    break;
                    
                case 'system':
                    ws.send(JSON.stringify({
                        type: 'system',
                        data: {
                            hostname: os.hostname(),
                            kernel: os.release(),
                            arch: os.arch(),
                            uptime: os.uptime()
                        }
                    }));
                    break;
                    
                default:
                    ws.send(JSON.stringify({
                        type: 'error',
                        data: 'Unknown command type'
                    }));
            }
            
            logFile.write(`${new Date().toISOString()} - Command: ${data.command}\n`);
            
        } catch (error) {
            ws.send(JSON.stringify({
                type: 'error',
                data: error.message
            }));
        }
    });

    ws.on('close', () => {
        console.log(`Client disconnected: ${clientIp}`);
    });
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================`);
    console.log(`Arch Terminal Controller (ROOT)`);
    console.log(`=================================`);
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket: ws://localhost:${PORT}`);
    console.log(`HTTP: http://localhost:${PORT}`);
    console.log(`Running as: root (UID: ${process.getuid()})`);
    console.log(`=================================`);
});
