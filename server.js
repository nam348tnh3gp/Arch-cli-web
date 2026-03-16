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
const clientProcesses = new Map(); // Lưu process đang chạy

app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        time: new Date().toISOString(),
        hostname: os.hostname(),
        uptime: os.uptime(),
        cpu: os.cpus().length,
        memory: os.totalmem()
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

// API lấy system stats realtime
app.get('/api/stats', (req, res) => {
    try {
        // CPU Usage
        const cpus = os.cpus();
        let totalIdle = 0, totalTick = 0;
        cpus.forEach(cpu => {
            for (let type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });
        const cpuUsage = ((1 - totalIdle / totalTick) * 100).toFixed(1);

        // Memory Usage
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memUsage = ((usedMem / totalMem) * 100).toFixed(1);

        // Disk Usage
        let diskUsage = '0';
        let diskUsed = '0 GB';
        let diskTotal = '0 GB';
        try {
            const df = execSync('df -h / | tail -1').toString();
            const parts = df.split(/\s+/);
            diskUsage = parts[4]?.replace('%', '') || '0';
            diskUsed = parts[2] || '0 GB';
            diskTotal = parts[1] || '0 GB';
        } catch (e) {}

        // Uptime
        const uptime = os.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const uptimeStr = `${hours}h ${minutes}m`;

        // Package count
        let packages = '0';
        try {
            packages = execSync('pacman -Q 2>/dev/null | wc -l').toString().trim();
        } catch (e) {}

        res.json({
            cpu: cpuUsage,
            cpuModel: cpus[0]?.model || 'Unknown',
            cpuCores: cpus.length,
            ram: memUsage,
            ramUsed: (usedMem / 1024 / 1024 / 1024).toFixed(1) + ' GB',
            ramTotal: (totalMem / 1024 / 1024 / 1024).toFixed(1) + ' GB',
            disk: diskUsage,
            diskUsed: diskUsed,
            diskTotal: diskTotal,
            uptime: uptimeStr,
            uptimeSeconds: uptime,
            packages: packages,
            hostname: os.hostname(),
            kernel: os.release(),
            loadavg: os.loadavg()[0].toFixed(2)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// WebSocket cho terminal
wss.on('connection', (ws) => {
    console.log('Client connected');
    
    // Set initial directory
    clientDirs.set(ws, '/root');
    
    ws.send(JSON.stringify({ 
        type: 'output', 
        data: '\n=== Arch Linux Terminal ===\n' +
              '✓ Hỗ trợ chương trình interactive (node, python)\n' +
              '✓ Gõ input trực tiếp vào ô command\n' +
              '✓ Dùng nút "Ctrl+C" để dừng chương trình\n\n'
    }));
    ws.send(JSON.stringify({ type: 'output', data: '# ' }));

    // Gửi stats qua WebSocket mỗi 2 giây
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
        } catch (err) {
            ws.send(JSON.stringify({ type: 'error', data: err.message }));
        }
    });

    ws.on('close', () => {
        // Kill process khi client disconnect
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
        
        // Kiểm tra directory
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
    
    // Spawn process với pipe cho stdin (hỗ trợ interactive)
    const proc = spawn('/bin/bash', ['-c', finalCommand], {
        cwd: currentDir,
        env: { 
            ...process.env, 
            TERM: 'xterm-256color'
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
    console.log('==========================================');
    console.log('Arch Linux Terminal');
    console.log('==========================================');
    console.log(`Port: ${PORT}`);
    console.log(`CPU: ${os.cpus().length} cores`);
    console.log(`RAM: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`);
    console.log('==========================================');
});
