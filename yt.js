const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cliProgress = require('cli-progress');

function getVideoId(url) {
  const match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/]+\/.+|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube.com\/shorts\/)([^"&?/\s]{11})/i);
  return match ? match[1] : null;
}

const videoInfos = {};

async function getVideoInfo(youtubeURL, outputDir) {
  const videoId = getVideoId(youtubeURL);
  return new Promise(async (resolve, reject) => {
    if (videoInfos[videoId]) {
      return resolve(videoInfos[videoId]);
    }
    const infoPath = path.join(outputDir, `${videoId}_info.json`);
    if (fs.existsSync(infoPath)) {
      const videoInfo = JSON.parse(fs.readFileSync(infoPath, 'UTF-8'));
      videoInfos[videoId] = videoInfo;
      resolve(videoInfo);
    } else {
      const videoInfo = await ytdl.getInfo(youtubeURL);
      fs.writeFileSync(infoPath, JSON.stringify(videoInfo, null, 2));
      videoInfos[videoId] = videoInfo;
      resolve(videoInfo);
    }
  });
}

function getFormats(videoInfo) {
  const videoFormat = videoInfo.formats.find(f => f.qualityLabel === '1080p') ||
    videoInfo.formats.find(f => f.qualityLabel === '720p') ||
    ytdl.chooseFormat(videoInfo.formats, { quality: 'highestvideo' });
  const audioFormat = ytdl.chooseFormat(videoInfo.formats, { quality: 'highestaudio' });

  return [videoFormat, audioFormat];
}

async function getVideoDetails(youtubeURL, outputDir) {
  const videoInfo = await getVideoInfo(youtubeURL, outputDir);

  return {
    title: videoInfo.videoDetails.title,
    lengthSeconds: videoInfo.videoDetails.lengthSeconds,
    author: videoInfo.videoDetails.author.name,
    uploadDate: videoInfo.videoDetails.uploadDate,
    description: videoInfo.videoDetails.description
  };
}

const multibar = new cliProgress.MultiBar({
  clearOnComplete: false,
  hideCursor: false,
  format: ' {bar} | {videoId} | {percentage}% | {value}/{total} MB',
}, cliProgress.Presets.shades_grey);

function getFilenames(youtubeURLs, outputDir) {
  return youtubeURLs.map((youtubeURL) => {
    const videoId = getVideoId(youtubeURL);
    return `${videoId}.mp4`;
  });
}

async function downloadVideo(youtubeURL, outputDir) {
  const fileExists = await videoExists(youtubeURL, outputDir);
  const videoInfo = await getVideoInfo(youtubeURL, outputDir);

  return new Promise((resolve, reject) => {
    const videoId = getVideoId(youtubeURL);
    if (!videoId) {
      throw new Error(`Ungültige YouTube-URL: ${youtubeURL}`);
    }

    if (fileExists) {
      console.log('File already exists. Skip Download ' + videoId)
      return resolve();
    }

    const [videoFormat, audioFormat] = getFormats(videoInfo);

    const videoStream = ytdl.downloadFromInfo(videoInfo, { format: videoFormat, dlChunkSize: 1024 * 1024 * 1 });
    const audioStream = ytdl.downloadFromInfo(videoInfo, { format: audioFormat, dlChunkSize: 1024 * 1024 * 1 });

    let videoDownloaded = 0;
    const progressBar = multibar.create(Math.floor(videoFormat.contentLength / (1024 * 1024)), 0);

    videoStream.on('data', (chunk) => {
      videoDownloaded += chunk.length;
      progressBar.update(Math.floor(videoDownloaded / (1024 * 1024)), { videoId });
    });

    const ffmpegMerge = spawn('ffmpeg', [
      '-i', 'pipe:0',
      '-i', 'pipe:1',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-vf', 'scale=1920:1080',
      '-r', '30',
      '-b:v', '6000k',
      '-crf', '26',
      '-f', 'mpegts',
      '-bufsize', '12000k',
      '-maxrate', '6000k',
      '-minrate', '6000k',
      '-bf', '2',
      '-g', '60',
      '-y',
      path.join(outputDir, `${videoId}_download`)
    ]);

    videoStream.pipe(ffmpegMerge.stdio[0]);
    audioStream.pipe(ffmpegMerge.stdio[1]);

    ffmpegMerge.on('error', (err) => {
      progressBar.stop();
      console.error('Fehler bei ffmpeg (Merge):', err);
      reject(err);
    });

    ffmpegMerge.on('exit', (code, signal) => {
      progressBar.stop();
      multibar.remove(progressBar);
      if (code === 0) {
        console.log('Finished download ' + videoId);
        fs.renameSync(path.join(outputDir, `${videoId}_download`), path.join(outputDir, `${videoId}.mp4`));
        resolve();
      } else {
        reject(new Error(`FFmpeg (Merge) wurde mit Code ${code} und Signal ${signal} beendet`));
      }
    });
  });
}

async function videoExists(youtubeURL, outputDir) {
  const videoId = getVideoId(youtubeURL);
  if (!videoId) {
    throw new Error(`Ungültige YouTube-URL: ${youtubeURL}`);
  }
  const videoFilePath = path.join(outputDir, `${videoId}.mp4`);
  return fs.existsSync(videoFilePath);
}

module.exports = {
  getVideoId,
  getVideoInfo,
  getVideoDetails,
  downloadVideo,
  videoExists,
  getFormats,
  getFilenames
}