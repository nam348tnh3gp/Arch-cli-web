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

// Lưu directory và session cho mỗi client
const clientDirs = new Map();
const clientSessions = new Map(); // Lưu trạng thái input mode

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

// API lấy system stats
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
    
    // Set initial directory và session
    clientDirs.set(ws, '/root');
    clientSessions.set(ws, {
        inputMode: false,
        currentFile: null,
        fileContent: []
    });
    
    ws.send(JSON.stringify({ 
        type: 'output', 
        data: '==========================================\n' +
              '  Arch Linux Full Terminal\n' +
              '==========================================\n' +
              '  ✓ System monitoring active\n' +
              '  ✓ CPU, RAM stats available\n' +
              '  ✓ Tạo file: cat > filename.js\n' +
              '  ✓ Kết thúc: Ctrl+D\n' +
              '==========================================\n'
    }));
    ws.send(JSON.stringify({ type: 'output', data: '# ' }));

    // Gửi stats mỗi 2 giây
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
            const session = clientSessions.get(ws);
            
            if (data.type === 'command') {
                // Kiểm tra nếu đang trong input mode
                if (session.inputMode) {
                    // Xử lý input mode (cat > file)
                    handleInputMode(data.command, ws, session);
                } else {
                    executeCommand(data.command, ws);
                }
            } else if (data.type === 'input') {
                // Xử lý input từ web terminal
                handleInputMode(data.data, ws, session);
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'error', data: err.message }));
        }
    });

    ws.on('close', () => {
        clearInterval(statsInterval);
        clientDirs.delete(ws);
        clientSessions.delete(ws);
    });
});

// Xử lý input mode (cat > file)
function handleInputMode(input, ws, session) {
    const currentDir = clientDirs.get(ws) || '/root';
    
    // Ctrl+D để kết thúc
    if (input === '\x04') { // Ctrl+D
        const filePath = path.join(currentDir, session.currentFile);
        try {
            fs.writeFileSync(filePath, session.fileContent.join('\n'));
            ws.send(JSON.stringify({ 
                type: 'output', 
                data: `\n✅ File ${session.currentFile} created successfully!\n`
            }));
        } catch (err) {
            ws.send(JSON.stringify({ 
                type: 'output', 
                data: `\n❌ Error: ${err.message}\n`
            }));
        }
        
        session.inputMode = false;
        session.currentFile = null;
        session.fileContent = [];
        ws.send(JSON.stringify({ type: 'output', data: '# ' }));
        return;
    }
    
    // Thêm dòng vào file content
    session.fileContent.push(input);
    ws.send(JSON.stringify({ type: 'output', data: '' })); // Echo nhẹ
}

function executeCommand(command, ws) {
    console.log(`Executing: ${command}`);
    
    const currentDir = clientDirs.get(ws) || '/root';
    const session = clientSessions.get(ws);
    
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
    
    // Xử lý cat > file (bật input mode)
    if (command.startsWith('cat > ')) {
        const filename = command.substring(6).trim();
        session.inputMode = true;
        session.currentFile = filename;
        session.fileContent = [];
        ws.send(JSON.stringify({ 
            type: 'output', 
            data: `📝 Đang tạo file ${filename}. Nhập nội dung và nhấn Ctrl+D để kết thúc:\n`
        }));
        return;
    }
    
    // Auto --noconfirm cho pacman
    let finalCommand = command;
    if (command.includes('pacman -S') && !command.includes('--noconfirm')) {
        finalCommand = command + ' --noconfirm';
    }
    
    const proc = spawn('/bin/bash', ['-c', finalCommand], {
        cwd: currentDir,
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

server.listen(PORT, '0.0.0.0', () => {
    console.log('==========================================');
    console.log('Arch Linux Terminal');
    console.log('==========================================');
    console.log(`Port: ${PORT}`);
    console.log(`CPU: ${os.cpus().length} cores`);
    console.log(`RAM: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`);
    console.log('==========================================');
});
