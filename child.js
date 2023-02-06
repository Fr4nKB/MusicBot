const { execSync } = require('child_process');

//extracts title and URL and returns it to the main process
process.on('message', (line) => {
    var res;
    try {   //line is an URL
        const temp = new URL(line);
        res = execSync('yt-dlp -o "%(title)s//youtu.be/%(id)s//%(duration)s" --get-filename --no-warnings '+line, { encoding: 'utf-8' });
    } catch(error) {    //line is the title of a song
        line.replace(/[^0-9a-z\s]/gi, '');    //sanitization, only alphanumeric + spaces
        res = execSync('yt-dlp -o "%(title)s//youtu.be/%(id)s//%(duration)s" --get-filename --no-warnings ytsearch:"'+line+'"', { encoding: 'utf-8' });
    }
    process.send(res);
});
