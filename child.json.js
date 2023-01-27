import { execSync } from 'child_process';
execSync('youtube-dl ytsearch:"'+process.argv[2]+'" -f 140 --output \"song'+process.argv[3]+'.%(ext)s\"', { encoding: 'utf-8' });
process.send('song'+process.argv[3]+'.m4a');