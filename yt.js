require('dotenv').config();

const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cliProgress = require('cli-progress');

const H264ENCODER = process.env.H264ENCODER;

function getVideoId(url) {
  const match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/]+\/.+|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube.com\/shorts\/)([^"&?/\s]{11})/i);
  return match ? match[1] : null;
}

const videoInfos = {};

async function getVideoInfo(youtubeURL) {
  const videoId = getVideoId(youtubeURL);
  return new Promise(async (resolve, reject) => {
    if (videoInfos[videoId]) {
      return resolve(videoInfos[videoId]);
    }
    const videoInfo = await ytdl.getInfo(youtubeURL);
    videoInfos[videoId] = videoInfo;
    resolve(videoInfo);
  });
}

function getFormats(videoInfo) {
  const videoFormat = videoInfo.formats.find(f => f.qualityLabel === '1080p') ||
    videoInfo.formats.find(f => f.qualityLabel === '720p') ||
    ytdl.chooseFormat(videoInfo.formats, { quality: 'highestvideo' });
  const audioFormat = ytdl.chooseFormat(videoInfo.formats, { quality: 'highestaudio' });

  return [videoFormat, audioFormat];
}

async function getVideoDetails(youtubeURL) {
  const videoInfo = await getVideoInfo(youtubeURL);
  const [videoFormat, audioFormat] = getFormats(videoInfo);

  return {
    title: videoInfo.videoDetails.title,
    lengthSeconds: Number(videoInfo.videoDetails.lengthSeconds),
    lengthMilliSeconds: Number(videoFormat.approxDurationMs),
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
    return path.join(outputDir, `${videoId}.mp4`);
  });
}

async function downloadVideo(youtubeURL, outputDir) {
  const fileExists = await videoExists(youtubeURL, outputDir);
  const videoInfo = await getVideoInfo(youtubeURL);

  return new Promise((resolve, reject) => {
    const videoId = getVideoId(youtubeURL);
    if (!videoId) {
      throw new Error(`Ungültige YouTube-URL: ${youtubeURL}`);
    }

    if (fileExists) {
      console.log('File already exists. Skip Download ' + videoId)
      return resolve();
    }

    console.log('Started download ' + videoId);

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
      '-c:v', H264ENCODER,
      '-c:a', 'aac',
      '-b:a', '160k',
      '-b:v', '4500k',
      '-vf', 'scale=1920:1080',
      '-r', '30',
      '-b:v', '4500k',
      '-muxrate', '4500k',
      '-bufsize', '4500k',
      '-maxrate', '4500k',
      '-minrate', '4500k',
      '-f', 'mpegts',
      '-x264opts', 'keyint=30:min-keyint=30:scenecut=30',
      '-y',
      path.join(outputDir, `${videoId}_download.mp4`)
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
        fs.renameSync(path.join(outputDir, `${videoId}_download.mp4`), path.join(outputDir, `${videoId}.mp4`));
        resolve();
      } else {
        reject(new Error(`FFmpeg (Merge) wurde mit Code ${code} und Signal ${signal} beendet`));
      }
    });
  });
}

function msToTime(duration) {
  let seconds = Math.floor((duration / 1000) % 60);
  let minutes = Math.floor((duration / (1000 * 60)) % 60);
  let hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

  hours = (hours < 10) ? "0" + hours : hours;
  minutes = (minutes < 10) ? "0" + minutes : minutes;
  seconds = (seconds < 10) ? "0" + seconds : seconds;

  return hours + ":" + minutes + ":" + seconds;
}


async function streamVideo(youtubeURL, offset, fifoPath, outputDir) {
  const videoInfo = await getVideoInfo(youtubeURL);

  return new Promise((resolve, reject) => {
    const videoId = getVideoId(youtubeURL);
    if (!videoId) {
      throw new Error(`Ungültige YouTube-URL: ${youtubeURL}`);
    }
    const logFilePath = path.join(outputDir, 'ffmpeg_stream.log');
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    const [videoFormat, audioFormat] = getFormats(videoInfo);

    console.log('Video offset: ' + offset);

    const videoStream = ytdl.downloadFromInfo(videoInfo, { format: videoFormat, dlChunkSize: 1024 * 128 * 1, liveBuffer: 4000, highWaterMark: 1024 * 1024 * 8 });
    const audioStream = ytdl.downloadFromInfo(videoInfo, { format: audioFormat, dlChunkSize: 1024 * 16 * 1, liveBuffer: 4000, highWaterMark: 1024 * 1024 });

    const ffmpegMerge = spawn('ffmpeg', [
      '-re',
      '-i', 'pipe:0',
      '-i', 'pipe:1',
      '-c:v', H264ENCODER,
      '-c:a', 'aac',
      '-b:a', '160k',
      '-b:v', '6000k',
      '-vf', 'setpts=PTS-STARTPTS',
      '-af', 'aresample=async=1',
      '-vf', 'scale=1920:1080',
      '-r', '30',
      '-err_detect', 'ignore_err',
      '-fflags', '+discardcorrupt',
      '-fflags', '+genpts',
      '-use_wallclock_as_timestamps', '1',
      '-muxrate', '6000k',
      '-bufsize', '12000k',
      '-maxrate', '6000k',
      '-minrate', '6000k',
      '-f', 'mpegts',
      '-bf', '2',
      '-g', '60',
      '-x264opts', 'keyint=30:min-keyint=30:scenecut=30',
      'pipe:2'
    ]);

    videoStream.pipe(ffmpegMerge.stdio[0]);
    audioStream.pipe(ffmpegMerge.stdio[1]);

    console.error('Start Streaming ' + youtubeURL);

    const fifoWriteStream = fs.createWriteStream(fifoPath, { flags: 'a' });
    let buffer = [];
    const bufferSize = 1024 * 128;
    let canWrite = true;

    function writeBuffer() {
      const combinedBuffer = Buffer.concat(buffer);
      buffer = [];
      if (!fifoWriteStream.write(combinedBuffer)) {
        canWrite = false;
        videoStream.pause();
        audioStream.pause();
        fifoWriteStream.once('drain', () => {
          canWrite = true;
          videoStream.resume();
          audioStream.resume();
        });
      }
    }

    ffmpegMerge.stdio[2].on('data', (data) => {
      buffer.push(data);
      const bufferedLength = buffer.reduce((acc, chunk) => acc + chunk.length, 0);
      if ((bufferedLength >= bufferSize) && canWrite) {
        writeBuffer();
      }
    });

    ffmpegMerge.on('error', (err) => {
      console.error('Fehler bei ffmpeg (Merge):', err);
      logStream.write(err);
    });

    ffmpegMerge.on('exit', (code, signal) => {
      if (buffer.length > 0) {
        const combinedBuffer = Buffer.concat(buffer);
        fifoWriteStream.write(combinedBuffer);
        buffer = []; // Clear buffer
      }
      logStream.end();
      fifoWriteStream.end();
      if (code === 0) {
        console.error('Finished Streaming ' + youtubeURL);
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
  streamVideo,
  videoExists,
  getFormats,
  getFilenames
}