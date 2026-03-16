const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Lưu directory và processes cho mỗi client
const clientDirs = new Map();
const clientProcesses = new Map(); // Lưu các process đang chạy

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

// API stats
app.get('/api/stats', (req, res) => {
    try {
        const cpus = os.cpus();
        let totalIdle = 0, totalTick = 0;
        cpus.forEach(cpu => {
            for (let type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });
        const cpuUsage = ((1 - totalIdle / totalTick) * 100).toFixed(1);

        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memUsage = ((totalMem - freeMem) / totalMem * 100).toFixed(1);

        res.json({
            cpu: cpuUsage,
            ram: memUsage,
            uptime: os.uptime()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// WebSocket cho terminal
wss.on('connection', (ws) => {
    console.log('Client connected');
    
    clientDirs.set(ws, '/root');
    
    ws.send(JSON.stringify({ 
        type: 'output', 
        data: '\n=== Arch Linux Terminal ===\n' +
              '✓ Hỗ trợ chương trình interactive (node, python, v.v.)\n' +
              '✓ Gõ input trực tiếp vào terminal\n' +
              '✓ Ctrl+C để dừng chương trình\n\n'
    }));
    ws.send(JSON.stringify({ type: 'output', data: '# ' }));

    // Stats interval
    const statsInterval = setInterval(() => {
        try {
            const cpus = os.cpus();
            let totalIdle = 0, totalTick = 0;
            cpus.forEach(cpu => {
                for (let type in cpu.times) {
                    totalTick += cpu.times[type];
                }
                totalIdle += cpu.times.idle;
            });
            const cpuUsage = ((1 - totalIdle / totalTick) * 100).toFixed(1);

            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const memUsage = ((totalMem - freeMem) / totalMem * 100).toFixed(1);

            ws.send(JSON.stringify({ 
                type: 'stats',
                cpu: cpuUsage,
                ram: memUsage,
                uptime: os.uptime()
            }));
        } catch (e) {}
    }, 2000);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'command') {
                // Nếu có process đang chạy, gửi input vào process đó
                const currentProc = clientProcesses.get(ws);
                if (currentProc && !currentProc.killed) {
                    // Gửi input vào process đang chạy
                    currentProc.stdin.write(data.command + '\n');
                } else {
                    // Không có process, chạy command mới
                    executeCommand(data.command, ws);
                }
            } 
            else if (data.type === 'stdin') {
                // Xử lý input trực tiếp (cho các chương trình interactive)
                const currentProc = clientProcesses.get(ws);
                if (currentProc && !currentProc.killed) {
                    currentProc.stdin.write(data.data);
                }
            }
            else if (data.type === 'sigint') {
                // Gửi Ctrl+C
                const currentProc = clientProcesses.get(ws);
                if (currentProc && !currentProc.killed) {
                    currentProc.kill('SIGINT');
                }
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'error', data: err.message }));
        }
    });

    ws.on('close', () => {
        // Kill tất cả processes khi client disconnect
        const proc = clientProcesses.get(ws);
        if (proc) {
            proc.kill();
        }
        clearInterval(statsInterval);
        clientDirs.delete(ws);
        clientProcesses.delete(ws);
    });
});

function executeCommand(command, ws) {
    console.log(`Executing: ${command}`);
    
    const currentDir = clientDirs.get(ws) || '/root';
    
    // Kill process cũ nếu có
    const oldProc = clientProcesses.get(ws);
    if (oldProc) {
        oldProc.kill();
    }
    
    // Xử lý lệnh cd
    if (command.startsWith('cd ')) {
        const targetDir = command.substring(3).trim();
        let newDir;
        
        if (targetDir === '..') {
            newDir = path.dirname(currentDir);
        } else if (targetDir.startsWith('/')) {
            newDir = targetDir;
        } else {
            newDir = path.join(currentDir, targetDir);
        }
        
        try {
            execSync(`test -d "${newDir}"`);
            clientDirs.set(ws, newDir);
            ws.send(JSON.stringify({ type: 'output', data: '' }));
        } catch (e) {
            ws.send(JSON.stringify({ type: 'output', data: `cd: ${targetDir}: No such directory\n` }));
        }
        ws.send(JSON.stringify({ type: 'output', data: '# ' }));
        return;
    }
    
    // Auto --noconfirm cho pacman
    let finalCommand = command;
    if (command.includes('pacman -S') && !command.includes('--noconfirm')) {
        finalCommand = command + ' --noconfirm';
    }
    
    // Spawn process với pty để hỗ trợ interactive
    const proc = spawn('/bin/bash', ['-c', finalCommand], {
        cwd: currentDir,
        env: { 
            ...process.env, 
            TERM: 'xterm-256color',
            NODE_NO_READLINE: '1' // Tắt readline của node
        },
        stdio: ['pipe', 'pipe', 'pipe'] // Cho phép stdin
    });
    
    // Lưu process
    clientProcesses.set(ws, proc);
    
    // Xử lý stdout
    proc.stdout.on('data', (data) => {
        ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
    });
    
    // Xử lý stderr
    proc.stderr.on('data', (data) => {
        ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
    });
    
    // Xử lý khi process kết thúc
    proc.on('close', (code) => {
        ws.send(JSON.stringify({ type: 'output', data: `\nProcess exited with code ${code}\n` }));
        ws.send(JSON.stringify({ type: 'output', data: '# ' }));
        clientProcesses.delete(ws);
    });
    
    // Xử lý lỗi
    proc.on('error', (err) => {
        ws.send(JSON.stringify({ type: 'error', data: err.message }));
        ws.send(JSON.stringify({ type: 'output', data: '# ' }));
        clientProcesses.delete(ws);
    });
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
});
