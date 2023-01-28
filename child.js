const { execSync } = require('child_process');

//extracts title and URL and returns it to the main process
process.on('message', (line) => {
    const res = execSync('youtube-dl -o "%(title)s//%(id)s" --get-filename ytsearch:"'+line+'"', { encoding: 'utf-8' });
    process.send(res);
});