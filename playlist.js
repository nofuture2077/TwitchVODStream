const fs = require('fs');
const path = require('path');
const { getVideoInfo } = require('./yt');

async function readPlaylist(playlistPath) {
    const playlistItems = fs.readFileSync(playlistPath, 'utf8').split('\n').filter(Boolean);    
    return playlistItems;
}

async function readPlaylistInfo(file, outputDir) {
    const playlistItems = readPlaylist(file);

    const promises = playlistItems.map((url) => getVideoInfo(url, outputDir));
    
    return Promise.all(promises);
}

function getFFMpegPlaylistName(outDir) {
    const playListPath = path.join(outDir, 'stream_playlist.txt');
    return playListPath;
}

function createFFmpegPlaylist(fileNames, outDir) {
    try {
      const playlistContent = (fileNames.map(fileName => `file '${fileName}'`).join('\n')+ "\n").repeat(100);
      const playlistPath = getFFMpegPlaylistName(outDir);
      fs.writeFileSync(playlistPath, playlistContent);
      console.log(`FFmpeg-Playlist erstellt: ${playlistPath}`);
      return playlistPath;
    } catch (err) {
      console.error('Fehler beim Erstellen der FFmpeg-Playlist:', err);
    }
  }

module.exports = {
    readPlaylist,
    readPlaylistInfo,
    createFFmpegPlaylist,
    getFFMpegPlaylistName
}