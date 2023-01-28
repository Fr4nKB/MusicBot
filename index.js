//import dependencies
const { config } = require('dotenv');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { fork } = require('child_process');
const { AudioPlayerStatus, createAudioPlayer, createAudioResource, joinVoiceChannel }  = require('@discordjs/voice');
const ytdl = require('ytdl-core');
config();

const yturl = 'https://www.youtube.com/watch?v=';
var voiceConnection = null;
var player = createAudioPlayer();
var resource = null;
var list = new Array();
const client = new Client({ intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates] });
const rest = new REST({version: '10'}).setToken(process.env.TOKEN);

//listener: event, function
client.on('ready', () => {
    console.log("Online");
});

//child preforked to fetch title and url
const child = fork('child.js');
child.on("message", function (message) {
    //format: Title - SongName-URL.ext
    var str = message.split('//');
    var obj = {'name': str.at(0), 'URL': str.at(1)};
    list.push(obj);
    if(list.length == 1 && player.state.status == AudioPlayerStatus.Idle) popFirst();   //command play has been executed and player is in idle
    else console.log(str.at(0)+' added to the queue');  //something is already playing
});

//pops the first element of the queue and plays it
function popFirst() {
    if(list.length > 0) {     //not empty
        var next = list.shift();    //pop first element
        const stream = ytdl(yturl+next.URL, { filter: 'audioonly'} );
        resource = createAudioResource(stream);
        player.play(resource);
    }
}

//listener to advance into the queue
player.on(AudioPlayerStatus.Idle, () => { popFirst(); });

client.on('interactionCreate', (interaction) => {

    if(interaction.isChatInputCommand()) {  //a command has been sent

        //retrieving infos on the channel
        const guild = client.guilds.cache.get(process.env.GUILD_ID)
        const member = guild.members.cache.get(interaction.member.user.id);
        const voiceChannel = member.voice.channel;
        
        if(interaction.commandName == 'play') {

            if(voiceConnection == null) {   //bot not conntected
                voiceConnection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: interaction.guildId,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });
                voiceConnection.subscribe(player);
            }

            var query = interaction.options.get('query').value; //needs sanitization
            console.log('Searching for "'+query+'"');
            child.send(query);

        }
        else if(interaction.commandName == 'pause' && player) { player.pause(); }
        else if(interaction.commandName == 'resume' && player) { player.unpause(); }
        else if(interaction.commandName == 'skip' && player) popFirst();
        else if(interaction.commandName == 'queue') {
            if(list.length == 0) {
                interaction.reply('Queue is empty');
            }
            else {
                var str = '';
                for(i = 0; i < list.length; i++) {
                    str += (i+1)+' - '+list.at(i).name+'\n';
                }
                interaction.reply(str);
            }
        }
        else if(interaction.commandName == 'stop' && player) {
            player.stop();
            resource = null;
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