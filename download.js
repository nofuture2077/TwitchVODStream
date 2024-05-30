const { readPlaylist } = require('./playlist');
const { downloadVideo } = require('./yt');
const pLimit = require('p-limit');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
    .option('poolSize', {
        alias: 'p',
        type: 'number',
        description: 'Größe des Promise-Pools',
        demandOption: false,
        default: 3
    })
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


readPlaylist(argv.playlist, argv.outDir).then((urls) => {
    const poolSize = argv.poolSize;

    const limiter = pLimit(poolSize);

    const tasks = urls.map(videoUrl => {
        return () => downloadVideo(videoUrl, './data/');
    });

    const limitedTasks = tasks.map(task => limiter(task));

    Promise.all(limitedTasks).then(results => {
        console.log('Alle Downloads abgeschlossen.');
    });
});