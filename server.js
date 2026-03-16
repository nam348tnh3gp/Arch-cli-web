// server.js - Cập nhật cho root user
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
}));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static('public'));

// Logging
const logDir = '/app/logs';
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logFile = fs.createWriteStream(path.join(logDir, 'terminal.log'), { flags: 'a' });
const errorLog = fs.createWriteStream(path.join(logDir, 'error.log'), { flags: 'a' });

// Root-only operations
const ROOT_COMMANDS = [
    'pacman',
    'systemctl',
    'useradd',
    'groupadd',
    'passwd',
    'shutdown',
    'reboot'
];

// Kiểm tra quyền root
console.log('Running as user:', process.env.USER);
console.log('UID:', process.getuid());
console.log('GID:', process.getgid());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        user: process.env.USER,
        uid: process.getuid(),
        uptime: os.uptime(),
        memory: process.memoryUsage(),
        cpu: os.cpus().length
    });
});

// System info endpoint
app.get('/api/system', (req, res) => {
    const info = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        cpus: os.cpus(),
        memory: {
            total: os.totalmem(),
            free: os.freemem(),
            used: os.totalmem() - os.freemem()
        },
        uptime: os.uptime(),
        loadavg: os.loadavg(),
        network: os.networkInterfaces()
    };
    res.json(info);
});

// Execute command với quyền root
function executeCommand(command, callback) {
    console.log(`Executing as root: ${command}`);
    
    // Kiểm tra command có an toàn không
    const dangerous = ['rm -rf /', 'mkfs', 'dd if='];
    if (dangerous.some(cmd => command.includes(cmd))) {
        callback('Error: Dangerous command blocked for safety');
        return;
    }
    
    const child = exec(command, {
        cwd: '/root',
        env: process.env,
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        uid: 0, // root UID
        gid: 0  // root GID
    }, (error, stdout, stderr) => {
        if (error) {
            callback(`Error: ${error.message}`);
            errorLog.write(`${new Date().toISOString()} - Error: ${error.message}\n`);
        } else {
            callback(stdout || stderr);
        }
    });
}

// WebSocket connection
wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`Root client connected: ${clientIp}`);
    
    // Gửi thông báo root access
    ws.send(JSON.stringify({
        type: 'system',
        data: {
            message: 'Connected with ROOT privileges',
            user: 'root',
            uid: 0,
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
                            data: output,
                            command: data.command
                        }));
                    });
                    break;
                    
                case 'install':
                    // Auto-install packages
                    executeCommand(`pacman -S --noconfirm ${data.package}`, (output) => {
                        ws.send(JSON.stringify({
                            type: 'install_result',
                            data: output
                        }));
                    });
                    break;
                    
                case 'service':
                    // Control system services
                    executeCommand(`systemctl ${data.action} ${data.service}`, (output) => {
                        ws.send(JSON.stringify({
                            type: 'service_result',
                            data: output
                        }));
                    });
                    break;
                    
                default:
                    ws.send(JSON.stringify({
                        type: 'error',
                        data: 'Unknown command'
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
});

// Error handling
process.on('uncaughtException', (error) => {
    errorLog.write(`${new Date().toISOString()} - Uncaught Exception: ${error.stack}\n`);
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
