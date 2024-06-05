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
      const playlistContent = (fileNames.map(fileName => `file '${fileName}'`).join('\n'));
      const playlistPath = getFFMpegPlaylistName(outDir);
      fs.writeFileSync(playlistPath, playlistContent);
      console.log(`FFmpeg-Playlist erstellt: ${playlistPath}`);
      return playlistPath;
    } catch (err) {
      console.error('Fehler beim Erstellen der FFmpeg-Playlist:', err);
    }
}

/**
 * Find the current video in the playlist at a given time.
 * 
 * @param {Array} playlist - Array of video objects, each containing a YouTube video ID and length in seconds.
 * @param {number} currentTime - The current time in milliseconds.
 * @returns {Object} The video object that is currently playing.
 */
function getCurrentVideo(playlist, currentTime) {
    // Calculate the total duration of the playlist
    const totalDuration = playlist.reduce((acc, video) => acc + parseInt(video.lengthMilliSeconds), 0);

    // Calculate the effective time within the playlist (handle looping)
    const effectiveTime = currentTime % totalDuration;

    let elapsedTime = 0;

    // Iterate through the playlist to find the current video
    for (const video of playlist) {
        elapsedTime += parseInt(video.lengthMilliSeconds);
        if (effectiveTime < elapsedTime) {
            return video;
        }
    }
    
    // In case something goes wrong, return null
    return null;
}

/**
 * Find the current video index and the offset in the playlist at a given time.
 * 
 * @param {Array} playlist - Array of video objects, each containing a YouTube video ID and length in milliseconds.
 * @param {number} currentTime - The current time in milliseconds.
 * @returns {Object} An object containing the index of the current video and the offset in milliseconds.
 */
function getCurrentVideoIndexAndOffset(playlist, currentTime) {
    // Calculate the total duration of the playlist
    const totalDuration = playlist.reduce((acc, video) => acc + video.lengthMilliSeconds, 0);
    
    // Calculate the effective time within the playlist (handle looping)
    const effectiveTime = currentTime % totalDuration;
    let elapsedTime = 0;

    // Iterate through the playlist to find the current video and offset
    for (let index = 0; index < playlist.length; index++) {
        const video = playlist[index];
        elapsedTime += video.lengthMilliSeconds;
        if (effectiveTime < elapsedTime) {
            const offset = effectiveTime - (elapsedTime - video.lengthMilliSeconds);
            return [ index, offset ];
        }
    }

    // In case something goes wrong, return null
    return [0, 0];
}

module.exports = {
    readPlaylist,
    readPlaylistInfo,
    createFFmpegPlaylist,
    getFFMpegPlaylistName,
    getCurrentVideo,
    getCurrentVideoIndexAndOffset
}