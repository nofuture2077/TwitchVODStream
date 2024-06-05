require('dotenv').config();

const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const { startRtmpStreaming } = require('./stream');
const { getFilenames, getVideoDetails, streamVideo } = require('./yt');
const { autoChangeTitle } = require('./twitch');
const { createFifo } = require('./fifo');

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
    .option('skip', {
      alias: 's',
      type: 'boolean',
      description: 'Skip to last playback state',
      demandOption: false,
      default: false
  })
    .argv;


const { readPlaylist } = require('./playlist');


const playlistPath = argv.playlist;
const outDir = argv.outDir;
const skip = argv.skip;

const fifo = createFifo();
startRtmpStreaming(fifo, outDir, skip);

readPlaylist(playlistPath, outDir).then(async (youtubeURLs) => {
  const playlistInfoPr = youtubeURLs.map(url => getVideoDetails(url, outDir));
  Promise.all(playlistInfoPr).then((playlistInfo) => {
    autoChangeTitle(playlistInfo);
  });
  while (true) {
    for (let i = 0; i < youtubeURLs.length;i++) {
      await new Promise((resolve) => {
        streamVideo(youtubeURLs[i], outDir, fifo).then(resolve);
      })
    }
  }
});