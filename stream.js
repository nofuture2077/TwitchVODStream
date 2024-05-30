require('dotenv').config();

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const rtmpUrl = process.env.RTMP_URL;

function writeStatus(statusInfo, statusFilePath) {
    fs.writeFileSync(statusFilePath, JSON.stringify(statusInfo, null, 2));
}

function readStatus(statusFilePath) {
    if (!fs.existsSync(statusFilePath)) {
        return {};
    }
    return JSON.parse(fs.readFileSync(statusFilePath, 'UTF-8'));
}

function startRtmpStreaming(playlist, outDir, skip) {
    const statusFilePath = path.join(outDir, 'status.json');
    const status = readStatus(statusFilePath);
    const skipTime = skip ? (status.runningTime || 0) : 0;
    
    const ffmpegProcess = spawn('ffmpeg', [
        '-ss', skipTime,
        '-re',
        '-f', 'concat',
        '-i', playlist,
        '-c:a', 'copy',
        '-c:v', 'copy',
        '-f', 'flv',
        rtmpUrl
    ]);

    console.log('Skipping ' + skipTime + 's');
    let runningTime = skipTime;

    setInterval(() => {
        runningTime += 10;
        writeStatus({runningTime}, statusFilePath);
    }, 10000);

    ffmpegProcess.on('exit', (code, signal) => {
        if (code === 0) {
            console.log('Streaming erfolgreich beendet');
        } else {
            console.error(`FFmpeg (Stream) wurde mit Code ${code} und Signal ${signal} beendet`);
        }
    });
}

module.exports = {
    readStatus,
    startRtmpStreaming
}