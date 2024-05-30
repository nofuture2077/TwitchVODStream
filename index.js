require('dotenv').config();

const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const { startRtmpStreaming } = require('./stream');
const { getFilenames } = require('./yt');

const argv = yargs(hideBin(process.argv))
    .option('playlist', {
        alias: 'l',
        type: 'string',
        description: 'Pfad zur Playlist Datei',
        demandOption: false,
        default: 'playlist.txt'
    })
    .option('outDir', {
        alias: 'o',
        type: 'string',
        description: 'Pfad zum Download Verzeichnis',
        demandOption: false,
        default: './data/'
    })
    .argv;


const { readPlaylist, createFFmpegPlaylist } = require('./playlist');


const playlistPath = argv.playlist;
const outDir = argv.outDir;

readPlaylist(playlistPath, outDir).then((youtubeURLs) => {
  const filenames = getFilenames(youtubeURLs, outDir);
  const ffMpegPlaylistName = createFFmpegPlaylist(filenames, outDir);

  startRtmpStreaming(ffMpegPlaylistName, outDir, true);
});