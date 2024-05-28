require('dotenv').config(); // Lade Umgebungsvariablen aus .env-Datei

const { spawnSync } = require('child_process');
const fs = require('fs');
const ytdl = require('ytdl-core');
const { spawn } = require('child_process');
const path = require('path');
const util = require('util');
const stat = util.promisify(fs.stat);
const fsp = require('fs').promises;
const { RefreshingAuthProvider } = require('@twurple/auth');
const { ApiClient } = require('@twurple/api');


const clientId = process.env.CLIENTID;
const clientSecret = process.env.CLIENTSECRET;
const botUserId = String(process.env.USERID);
const channelUserId = String(process.env.CHANNELID);
const botTokenData = JSON.parse(fs.readFileSync(`./token/tokens.${botUserId}.json`, 'UTF-8'));
const channelTokenData = JSON.parse(fs.readFileSync(`./token/tokens.${channelUserId}.json`, 'UTF-8'));

const authProvider = new RefreshingAuthProvider(
	{
		clientId,
		clientSecret,
		onRefresh: async (userId, newTokenData) => {
			try {
				fs.writeFileSync(`./token/tokens.${userId}.json`, JSON.stringify(newTokenData, null, 4), 'UTF-8')
			} catch(ex) {
				console.error(filename, ex);
			}
			
		}
	}
);

authProvider.addUser(botUserId, botTokenData, [
    "chat"
]);

authProvider.addUser(channelUserId, channelTokenData, []);

const twitchApi = new ApiClient({ authProvider });

// RTMP-Server-URL aus Umgebungsvariablen lesen
const rtmpUrl = process.env.RTMP_URL;
const outputDir = 'data/';

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

function getVideoId(url) {
  const match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/]+\/.+|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube.com\/shorts\/)([^"&?/\s]{11})/i);
  return match ? match[1] : null;
}

// Funktion zum Vorladen eines YouTube-Videos
async function preloadVideo(youtubeURL, onData) {
  const videoInfo = await ytdl.getInfo(youtubeURL);

  return new Promise((resolve, reject) => {
    const videoId = getVideoId(youtubeURL);
    if (!videoId) {
      throw new Error(`Ungültige YouTube-URL: ${youtubeURL}`);
    }

    const videoDetails = {
      title: videoInfo.videoDetails.title,
      lengthSeconds: videoInfo.videoDetails.lengthSeconds,
      author: videoInfo.videoDetails.author.name,
      uploadDate: videoInfo.videoDetails.uploadDate,
      description: videoInfo.videoDetails.description
    };

    fs.writeFileSync(path.join(outputDir, `${videoId}.json`), JSON.stringify(videoDetails, null, 2));
    const videoFormat = videoInfo.formats.find(f => f.qualityLabel === '1080p') ||
        videoInfo.formats.find(f => f.qualityLabel === '720p') ||
        ytdl.chooseFormat(videoInfo.formats, { quality: 'highestvideo' });
    const audioFormat = ytdl.chooseFormat(videoInfo.formats, { quality: 'highestaudio' });


    const videoStream = ytdl.downloadFromInfo(videoInfo, { format: videoFormat });
    const audioStream = ytdl.downloadFromInfo(videoInfo, { format: audioFormat });

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

    ffmpegMerge.stdio[2].on('data', onData);

    ffmpegMerge.on('error', (err) => {
      console.error('Fehler bei ffmpeg (Merge):', err);
      reject(err);
    });

    ffmpegMerge.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg (Merge) wurde mit Code ${code} und Signal ${signal} beendet`));
      }
    });
  });
}

// Funktion zum Starten des FFmpeg-Prozesses für das Streamen zur RTMP-URL
function startRtmpStreaming(inputFifoPath, rtmpUrl) {
  const ffmpegProcess = spawn('ffmpeg', [
    '-i', inputFifoPath,
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-vf', 'scale=1920:1080',
    '-b:v', '4500k',
    '-crf', '23',
    '-f', 'flv', 
    '-bufsize', '4500k',
    '-maxrate', '9000k',
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
}

function nextVideo(url) {
    const ytId = getVideoId(url);
    
    setTimeout(() => {
      const data = JSON.parse(fs.readFileSync(`./data/${ytId}.json`, 'UTF-8'));
      twitchApi.channels.updateChannelInfo(channelUserId, {title: data.title});
      console.log('Change Titel: ' + data.title);
    }, 10000);
}

// Hauptfunktion zum Streamen der Playlist
async function streamPlaylist(playlist) {
  console.log('Starte Streaming der Playlist');
  // Starte das Streamen zur RTMP-URL
  startRtmpStreaming(fifoPath, rtmpUrl);

  let i = 0;
  while (true) {
    const url = playlist[i % playlist.length];
    
    console.log(`Verarbeite Video ${i + 1} von ${playlist.length}: ${url}`);

    // Überprüfe, ob der FIFO-Puffer nicht voll ist, bevor das Video vorab geladen wird
    try {
      // Vorladen des Videos
      nextVideo(url);
      // Schreibe das vorab geladene Video in die FIFO-Datei
      const writeStream = fs.createWriteStream(fifoPath, { flags: 'a' });

      await preloadVideo(url, (data) => {
        if (!writeStream.write(data)) {
          writeStream.once('drain', () => {
          });
        }
      });

      await videoBuffer.resolve;

      if (++i >= playlist.length) {
        i = 0;
      }
    } catch (err) {
      console.error(`Fehler beim Streamen von Video ${i + 1} von ${playlist.length}: ${err.message}`);
    }
  }
}

// Starte die Playlist-Streaming-Funktion
const playlist = readPlaylist('playlist.txt');
streamPlaylist(playlist);