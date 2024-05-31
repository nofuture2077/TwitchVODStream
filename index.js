require('dotenv').config();

const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const { startRtmpStreaming } = require('./stream');
const { getFilenames, getVideoDetails } = require('./yt');
const { autoChangeTitle } = require('./twitch');

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


const { readPlaylist, createFFmpegPlaylist } = require('./playlist');


const playlistPath = argv.playlist;
const outDir = argv.outDir;
const skip = argv.skip;

readPlaylist(playlistPath, outDir).then((youtubeURLs) => {
  const filenames = getFilenames(youtubeURLs, outDir);
  let repeatedArray = Array.from({ length: 10 }, () => filenames).flat();
  const concatFiles = "concat:" + repeatedArray.join("|");
  startRtmpStreaming(concatFiles, outDir, skip);
  
  const playlistInfoPr = youtubeURLs.map(url => getVideoDetails(url, outDir));
  Promise.all(playlistInfoPr).then((playlistInfo) => {
    autoChangeTitle(playlistInfo);
  });
});