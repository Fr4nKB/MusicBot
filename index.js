//import dependencies
import { config } from 'dotenv';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { exec, fork, execSync } from 'child_process';
import { AudioPlayerStatus, createAudioPlayer, createAudioResource, joinVoiceChannel } from '@discordjs/voice';
config();

var voiceConnection = null;
var player = createAudioPlayer();
var resource = null;
var list = new Array();
var numList = 0;
var customVol = 0.5;
var child;

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

process.on('SIGINT', function() {
    console.log("Caught interrupt signal");
    execSync('rm song*');        
    process.exit();
});

function popFirst() {
    if(list.length > 0) {     //not empty
        var name = list.shift();    //pop first element
        resource = createAudioResource(name, {inlineVolume: true});
        resource.volume.setVolume(customVol);
        player.play(resource);
    }
}

player.on(AudioPlayerStatus.Idle, () => { popFirst(); });

client.on('interactionCreate', (interaction) => {

    if(interaction.isChatInputCommand()) {

        const guild = client.guilds.cache.get(process.env.GUILD_ID)
        const member = guild.members.cache.get(interaction.member.user.id);
        const voiceChannel = member.voice.channel;
        

        if(interaction.commandName == 'play') {

            if(voiceConnection == null) {
                voiceConnection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: interaction.guildId,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });
                voiceConnection.subscribe(player);
            }

            var query = interaction.options.get('query').value;
            if(player.state.status == 'idle') {
                console.log('Downloading '+query);
                execSync('yt-dlp ytsearch:"'+query+'" -f 140 --output \"song'+numList+'.%(ext)s\"', { encoding: 'utf-8' });
                resource = createAudioResource('song'+numList+'.m4a', {inlineVolume: true});
                resource.volume.setVolume(customVol);
                player.play(resource);
            }
            else {
                console.log('Downloading '+query);
                const child = fork("child.js", [query, numList]);
                child.on("message", function (message) {
                    list.push(message);
                    console.log('Finished downloading '+query);
                });
            }
            numList++;

        }
        else if(interaction.commandName == 'pause' && player) { player.pause(); }
        else if(interaction.commandName == 'resume' && player) { player.unpause(); }
        else if(interaction.commandName == 'skip' && player) popFirst();
        else if(interaction.commandName == 'stop' && player) {
            player.stop();
            resource = null;
        }
        else if(interaction.commandName == 'volume' && resource) {
            var value = interaction.options.get('value').value;
            if(value <= 0) value = 0.1;
            if(value > 1) value = 1;
            resource.volume.setVolume(customVol = value);
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
                generateCommand('stop', 'Stops player', null, null),
                generateCommand('volume', 'Set volume of the bot', 'value', 'value in [0.1 - 1]')
            ],
        });
        client.login(process.env.TOKEN);
    } catch(err) { console.log(err); }

}

main();