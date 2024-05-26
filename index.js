require('dotenv').config(); // Lade Umgebungsvariablen aus .env-Datei

const fs = require('fs');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const stream = require('stream');

// RTMP-Server-URL aus Umgebungsvariablen lesen
const rtmpUrl = process.env.RTMP_URL;

// Funktion zum Streamen eines YouTube-Videos
function streamVideo(youtubeURL) {
  return new Promise((resolve, reject) => {
    console.log(`Starte Streaming: ${youtubeURL}`);
    const videoStream = ytdl(youtubeURL, { quality: 'highest' });

    const passThrough = new stream.PassThrough();
    videoStream.pipe(passThrough);

    ffmpeg(passThrough)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        "-f flv", 
        "-flvflags no_duration_filesize",
        '-vf scale=1920:1080', // Erzwingt eine Auflösung von 1920x1080 (1080p)
        '-b:v 7000k', // Erzwingt eine Bitrate von 7700 kbps
      ])
      .on('error', (err) => {
        console.error('Fehler bei ffmpeg:', err);
        reject(err);
      })
      .on('end', () => {
        console.log(`Streaming beendet: ${youtubeURL}`);
        resolve();
      })
      .output(rtmpUrl)
      .run();
  });
}

// Playlist-Datei lesen
function readPlaylist(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
}

// Hauptfunktion zum Streamen der Playlist
async function streamPlaylist() {
  const playlist = readPlaylist('playlist.txt');

  for (const url of playlist) {
    try {
      await streamVideo(url);
    } catch (err) {
      console.error('Fehler beim Streamen des Videos:', err);
    }
  }

  console.log('Alle Videos gestreamt');
}

// Starte das Streaming der Playlist
streamPlaylist();
