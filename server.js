// Import các module
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', time: new Date().toISOString() });
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
    ws.send(JSON.stringify({ type: 'output', data: '📁 Working directory: /root\n' }));
    ws.send(JSON.stringify({ type: 'output', data: '# ' }));

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
        console.log('Client disconnected');
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================`);
    console.log(`Arch Terminal Server Started`);
    console.log(`=================================`);
    console.log(`Port: ${PORT}`);
    console.log(`Public directory: ${path.join(__dirname, 'public')}`);
    
    // Kiểm tra file index.html
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        console.log(`✅ index.html found`);
    } else {
        console.error(`❌ index.html NOT found at: ${indexPath}`);
        process.exit(1);
    }
    console.log(`=================================`);
});

// Handle errors
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});
