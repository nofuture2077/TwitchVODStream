require('dotenv').config();

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Retrieve the RTMP URL from environment variables
const rtmpUrl = process.env.RTMP_URL;
const H264ENCODER = process.env.H264ENCODER;

/**
 * Writes status information to a specified file.
 * 
 * @param {Object} statusInfo - The status information to write.
 * @param {string} statusFilePath - The file path to write the status information.
 */
function writeStatus(statusInfo, statusFilePath) {
    fs.writeFileSync(statusFilePath, JSON.stringify(statusInfo, null, 2));
}

/**
 * Reads status information from a specified file.
 * 
 * @param {string} statusFilePath - The file path to read the status information.
 * @returns {Object} The status information read from the file.
 */
function readStatus(outDir) {
    const statusFilePath = path.join(outDir, 'status.json');
    if (!fs.existsSync(statusFilePath)) {
        return { runningTime: 0 };
    }
    return JSON.parse(fs.readFileSync(statusFilePath, 'UTF-8'));
}

/**
 * Starts RTMP streaming using FFmpeg.
 * 
 * @param {string} input - The input file or stream.
 * @param {string} outDir - The directory where the status file is located.
 * @param {boolean} skip - Whether to skip based on the previously recorded running time.
 */
function startRtmpStreaming(input, outDir, skip) {
    const statusFilePath = path.join(outDir, 'status.json');
    const logFilePath = path.join(outDir, 'ffmpeg.log');
    const status = readStatus(outDir);
    const skipTime = skip ? (status.runningTime || 0) : 0;

    console.log('Stream zu Twitch gestartet');

    const ffmpegArgs = [
        '-re',
        '-err_detect', 'ignore_err',
        '-fflags', '+discardcorrupt',
        '-i', input,
        '-c:v', H264ENCODER,
        '-c:a', 'copy',
        '-r', '30',
        '-b', '6000k',
        '-muxrate', '6000k',
        '-bufsize', '6000k',
        '-maxrate', '6000k',
        '-minrate', '6000k',
        '-x264opts', 'keyint=30:min-keyint=30:scenecut=30',
        '-f', 'flv',
        rtmpUrl
    ];

    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

    console.log('Skipping ' + skipTime + 's');
    let runningTime = skipTime;

    // Create a write stream for the log file
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    // Pipe FFmpeg stdout and stderr to the log file and the console
    ffmpegProcess.stdout.on('data', (data) => {
        logStream.write(data);
    });

    ffmpegProcess.stderr.on('data', (data) => {
        logStream.write(data);
    });

    const intervalId = setInterval(() => {
        runningTime += 10;
        writeStatus({ runningTime }, statusFilePath);
    }, 10000);

    ffmpegProcess.on('exit', (code, signal) => {
        clearInterval(intervalId);
        logStream.end();
        if (code === 0) {
            console.log('Streaming successfully ended');
        } else {
            console.error(`FFmpeg (Stream) exited with code ${code} and signal ${signal}`);
        }
    });
}

module.exports = {
    readStatus,
    startRtmpStreaming
};
