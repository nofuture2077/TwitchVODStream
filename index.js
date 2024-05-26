require('dotenv').config(); // Lade Umgebungsvariablen aus .env-Datei

const { spawnSync } = require('child_process');
const fs = require('fs');
const ytdl = require('ytdl-core');
const { spawn } = require('child_process');
const path = require('path');

// RTMP-Server-URL aus Umgebungsvariablen lesen
const rtmpUrl = process.env.RTMP_URL;

const fifoPath = path.join(__dirname, 'video_fifo');
try {
  // Execute the shell command to create the FIFO file
  const result = spawnSync('mkfifo', [fifoPath]);
  if (result.error) {
    throw result.error;
  }
  console.log('FIFO-Datei erstellt:', fifoPath);
} catch (err) {
  console.error('Fehler beim Erstellen der FIFO-Datei:', err);
}


// Playlist-Datei lesen
function readPlaylist(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
}

// Funktion zum Vorladen eines YouTube-Videos
async function preloadVideo(youtubeURL) {
  return new Promise((resolve, reject) => {
    const videoStream = ytdl(youtubeURL, { quality: 'highestvideo' });
    const audioStream = ytdl(youtubeURL, { quality: 'highestaudio' });

    const ffmpegMerge = spawn('ffmpeg', [
      '-i', 'pipe:0',
      '-i', 'pipe:1',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-f', 'mpegts',
      'pipe:2'
    ]);

    videoStream.pipe(ffmpegMerge.stdio[0]);
    audioStream.pipe(ffmpegMerge.stdio[1]);

    const buffers = [];
    ffmpegMerge.stdio[2].on('data', (data) => {
      buffers.push(data);
    });

    ffmpegMerge.on('error', (err) => {
      console.error('Fehler bei ffmpeg (Merge):', err);
      reject(err);
    });

    ffmpegMerge.on('exit', (code, signal) => {
      if (code === 0) {
        resolve(Buffer.concat(buffers));
      } else {
        reject(new Error(`FFmpeg (Merge) wurde mit Code ${code} und Signal ${signal} beendet`));
      }
    });
  });
}

// Hauptfunktion zum Streamen der Playlist
async function streamPlaylist() {
  const playlist = readPlaylist('playlist.txt');
  console.log('Starte Streaming der Playlist');

  // Starten Sie den FFmpeg-Prozess, um die FIFO-Datei zu lesen und an den RTMP-Server zu streamen
  const ffmpegProcess = spawn('ffmpeg', [
    '-re',
    '-i', fifoPath,
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-vf', 'scale=1920:1080',
    '-b:v', '7000k',
    '-crf', '18',
    '-f', 'flv', 
    '-maxrate', '8000k', 
    '-bufsize', '16000k', 
    rtmpUrl
  ]);

  ffmpegProcess.on('error', (err) => {
    console.error('Fehler bei ffmpeg (Stream):', err);
  });

  ffmpegProcess.on('exit', (code, signal) => {
    if (code === 0) {
      console.log('Streaming erfolgreich beendet');
    } else {
      console.error(`FFmpeg (Stream) wurde mit Code ${code} und Signal ${signal} beendet`);
    }
  });

  while (true) {
    for (let i = 0; i < playlist.length; i++) {
      const url = playlist[i];
      console.log(`Verarbeite Video ${i + 1} von ${playlist.length}: ${url}`);

      try {
        // Vorladen des nächsten Videos
        const videoBuffer = await preloadVideo(url);

        // Schreibe das vorab geladene Video in die FIFO-Datei
        const writeStream = fs.createWriteStream(fifoPath, { flags: 'a' });
        writeStream.write(videoBuffer);
        writeStream.end();

        console.log(`Video ${i + 1} von ${playlist.length} gestreamt`);
      } catch (err) {
        console.error(`Fehler beim Streamen von Video ${i + 1} von ${playlist.length}: ${err.message}`);
      }
    }
    console.log('Wiederhole die Playlist');
  }
}

streamPlaylist();
