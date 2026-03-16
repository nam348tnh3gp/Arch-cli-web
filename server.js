const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static('public'));

// Tạo thư mục downloads
const downloadsDir = '/downloads';
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

// Hàm tự động thêm --noconfirm
function autoYes(command) {
    // Nếu là lệnh pacman install/update
    if (command.match(/^pacman -S/) || command.match(/^sudo pacman -S/)) {
        if (!command.includes('--noconfirm')) {
            if (command.includes('pacman -Syu')) {
                command = command.replace('pacman -Syu', 'pacman -Syu --noconfirm');
            } else if (command.includes('pacman -S')) {
                command = command.replace('pacman -S', 'pacman -S --noconfirm');
            }
        }
    }
    // Nếu là lệnh yay/paru
    else if (command.match(/^yay -S/) || command.match(/^paru -S/)) {
        if (!command.includes('--noconfirm')) {
            command = command + ' --noconfirm';
        }
    }
    return command;
}

// Xử lý command
function executeCommand(command, ws) {
    console.log(`Executing: ${command}`);
    
    // Tự động thêm --noconfirm
    const finalCommand = autoYes(command);
    
    if (finalCommand !== command) {
        ws.send(JSON.stringify({
            type: 'output',
            data: `ℹ️ Auto added --noconfirm: ${finalCommand}\n`
        }));
    }
    
    // Kiểm tra nếu là lệnh yt-dlp
    if (finalCommand.includes('yt-dlp')) {
        const process = spawn('sh', ['-c', finalCommand]);
        
        process.stdout.on('data', (data) => {
            ws.send(JSON.stringify({
                type: 'ytdlp-output',
                data: data.toString()
            }));
        });
        
        process.stderr.on('data', (data) => {
            ws.send(JSON.stringify({
                type: 'ytdlp-output',
                data: data.toString()
            }));
        });
        
        process.on('close', (code) => {
            ws.send(JSON.stringify({
                type: 'ytdlp-done',
                data: `✅ Process finished with code ${code}`
            }));
            ws.send(JSON.stringify({
                type: 'output',
                data: '# '
            }));
        });
    }
    // Lệnh thường
    else {
        const process = spawn('sh', ['-c', finalCommand]);
        
        process.stdout.on('data', (data) => {
            ws.send(JSON.stringify({
                type: 'output',
                data: data.toString()
            }));
        });
        
        process.stderr.on('data', (data) => {
            ws.send(JSON.stringify({
                type: 'output',
                data: data.toString()
            }));
        });
        
        process.on('close', (code) => {
            ws.send(JSON.stringify({
                type: 'output',
                data: '# '
            }));
        });
    }
}

// WebSocket connection
wss.on('connection', (ws) => {
    console.log('Client connected');
    
    ws.send(JSON.stringify({ 
        type: 'system', 
        data: '✅ Connected to Arch Linux (Auto Yes mode)'
    }));
    
    ws.send(JSON.stringify({
        type: 'output',
        data: 'ℹ️ Auto Yes: Tự động thêm --noconfirm cho pacman\n'
    }));
    
    ws.send(JSON.stringify({
        type: 'output',
        data: '📥 yt-dlp ready: Có thể download video từ YouTube, Facebook, TikTok...\n'
    }));
    
    ws.send(JSON.stringify({
        type: 'output',
        data: '# '
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'command') {
                executeCommand(data.command, ws);
            }
        } catch (err) {
            ws.send(JSON.stringify({ 
                type: 'error', 
                data: err.message 
            }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// API endpoints
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        time: new Date().toISOString(),
        hostname: os.hostname(),
        ytdlp: getYtDlpVersion()
    });
});

app.get('/api/downloads', (req, res) => {
    fs.readdir(downloadsDir, (err, files) => {
        if (err) {
            res.json({ error: err.message });
        } else {
            res.json({ files });
        }
    });
});

app.post('/api/download', (req, res) => {
    const { url, format } = req.body;
    
    let command = 'yt-dlp';
    
    if (format === 'audio') {
        command += ' -x --audio-format mp3';
    } else if (format === 'mp4') {
        command += ' -f "best[ext=mp4]"';
    } else {
        command += ' -f best';
    }
    
    command += ` -o "${downloadsDir}/%(title)s.%(ext)s" "${url}"`;
    
    exec(command, (error, stdout, stderr) => {
        if (error) {
            res.json({ error: error.message });
        } else {
            res.json({ output: stdout || stderr });
        }
    });
});

function getYtDlpVersion() {
    try {
        const { execSync } = require('child_process');
        const version = execSync('yt-dlp --version', { encoding: 'utf8' });
        return version.trim();
    } catch {
        return 'unknown';
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('=================================');
    console.log('Arch Terminal Controller Started');
    console.log('=================================');
    console.log(`Port: ${PORT}`);
    console.log(`yt-dlp: ${getYtDlpVersion()}`);
    console.log(`Downloads: ${downloadsDir}`);
    console.log('Auto Yes: Active');
    console.log('=================================');
});
