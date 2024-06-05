const { spawnSync } = require('child_process');
const path = require('path');

function createFifo() {
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

    return fifoPath;
}

module.exports = {
    createFifo
}