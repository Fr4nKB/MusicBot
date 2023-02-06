//import dependencies
const { config } = require('dotenv');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, createComponent } = require('discord.js');
const { fork } = require('child_process');
const { AudioPlayerStatus, createAudioPlayer, createAudioResource, joinVoiceChannel, VoiceConnectionStatus }  = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const fluentFfmpeg = require('fluent-ffmpeg');
config();

var currentSong;    //URL for the current song
var currentSongDuration;    //duration in seconds of the current song
var currentSecPlayed;   //how many seconds of the current song have been played
var time;   //interval to update currentSecPlayed
var voiceConnection = null;
var player = createAudioPlayer();
var resource = null;
var list = new Array();
var interactionCollector = new Array();
var guild, member;
const client = new Client({ intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
] });
const rest = new REST({version: '10'}).setToken(process.env.TOKEN);

client.on('ready', () => {
    console.log("Online");
});

//tries to recover the current song and play from where it interrupted
player.on('error', (error) => {
    clearInterval(time);
    console.log('Player crashed');
    if(!player) player = createAudioPlayer();
    if(voiceConnection) {
        voiceConnection.subscribe(player);
        var stream = null;
        while(!stream) {
            stream = ytdl(currentSong, { filter: 'audioonly', quality: 'lowestaudio', highWaterMark: 1<<25 } );
        }
        //reproducing the song where it stopped
        var editedSong = fluentFfmpeg({source: stream}).toFormat('mp3').setStartTime(currentSecPlayed);
        resource = createAudioResource(editedSong, { highWaterMark: 1 });
        player.play(resource);
        time = setInterval(function () { currentSecPlayed += 1; }, 1000);
    }
});

//child preforked to fetch title and url
const child = fork('child.js');
child.on("message", function (message) {

    var str = message.split('//');  //format: Title//URL//duration
    var obj = {'name': str.at(0), 'url': str.at(1), 'duration': str.at(2)};
    list.push(obj);
    
    var pos = interactionCollector.findIndex(element => element.id == list.length);
    var interaction = interactionCollector.at(pos).interaction;

    if(list.length == 1 && player.state.status == AudioPlayerStatus.Idle) {
        popFirst();   //command play has been executed and player is in idle
        interaction.editReply('Riproduco **'+str.at(0)+'**');
        interactionCollector.splice(pos);
    }
    else {
        console.log(str.at(0)+' added to the queue');  //something is already playing
        interaction.editReply('**'+str.at(0)+'** aggiunto alla coda');
        interactionCollector.splice(pos);
    }

});

//pops the first element of the queue and plays it
function popFirst() {
    if(list.length > 0) {     //not empty

        var next = list.shift();    //pop first element
        currentSong = 'https://'+next.url;
        currentSongDuration = next.duration;
        currentSecPlayed = 0;
        
        const stream = ytdl(currentSong, { filter: 'audioonly', quality: 'lowestaudio', highWaterMark: 1<<25 } );
        resource = createAudioResource(stream, { highWaterMark: 1 });
        player.play(resource);
        time = setInterval(function () { currentSecPlayed += 1; }, 1000);
        
    }
}

//listener to advance into the queue
player.on(AudioPlayerStatus.Idle, () => { popFirst(); });

client.on('interactionCreate', (interaction) => {

    if(interaction.isChatInputCommand()) {  //a command has been sent

        interaction.deferReply();

        //retrieving infos on the channel
        guild = client.guilds.cache.get(process.env.GUILD_ID)
        member = guild.members.cache.get(interaction.member.user.id);
        const voiceChannel = member.voice.channel;

        if(!voiceChannel) {
            interaction.editReply('Per utilizzare il comando play devi prima connetterti in un canale');
        }
        
        else if(interaction.commandName == 'play') {

            if(voiceConnection == null) {   //bot not conntected
                voiceConnection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: interaction.guildId,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });
                voiceConnection.subscribe(player);
                voiceConnection.on(VoiceConnectionStatus.Disconnected, () => {
                    voiceConnection = null;
                });
            }

            var query = interaction.options.get('query').value;
            console.log('Searching for "'+query+'"');
            child.send(query);
            var obj = {'id': list.length+1,'interaction': interaction};
            interactionCollector.push(obj);

        }
        else if(interaction.commandName == 'pause') {
            if(player.state.status == AudioPlayerStatus.Playing) {
                player.pause();
                interaction.editReply('Brano in pausa');
            }
            else interaction.editReply('Prima dovresti riprodurre qualcosa, puoi riprodurre un brano con /play');
        }
        else if(interaction.commandName == 'resume') {
            if(player.state.status == AudioPlayerStatus.Paused) {
                player.unpause();
                interaction.editReply('Riproduco');
            }
            else interaction.editReply('Nessun brano in pausa, puoi riprodurre un brano con /play');
        }
        else if(interaction.commandName == 'skip') {
            if(list.length > 0) {
                popFirst();
                interaction.editReply('Riproduco il prossimo brano in coda');
            }
            else interaction.editReply('Non ci sono brani in coda');
        }
        else if(interaction.commandName == 'queue') {
            if(list.length == 0) {
                interaction.editReply('La coda è vuota');
            }
            else {
                var str = '';
                for(i = 0; i < list.length; i++) {
                    str += (i+1)+' - '+list.at(i).name+'\n';
                }
                interaction.editReply(str);
            }
        }
        else if(interaction.commandName == 'stop') {
            if(player.state.status == AudioPlayerStatus.Playing) {
                player.stop();
                resource = null;
                interaction.editReply('La festa è finita\:triumph:');
            }
            else interaction.editReply('Prima dovresti riprodurre qualcosa');
        }

    }

});

//creates a command and returns it in JSON format
function generateCommand(name, description, optName, optDesc) {
    
    const command = new SlashCommandBuilder();
    command.setName(name).setDescription(description);

    if(optName != null) {
        command.addStringOption(option =>
            option.setName(optName)
            .setDescription(optDesc)
            .setRequired(true)
        );
    }

    return command.toJSON();

}

async function main() {

    try{
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
            body: [
                generateCommand('play', 'Plays a song', 'query', 'the song you want to play'),
                generateCommand('pause', 'Pauses current song', null, null),
                generateCommand('resume', 'Resumes current song', null, null),
                generateCommand('skip', 'Skips current song', null, null),
                generateCommand('queue', 'Shows the queue', null, null),
                generateCommand('stop', 'Stops player', null, null)
            ],
        });
        client.login(process.env.TOKEN);
    } catch(err) { console.log(err); }

}

main();
