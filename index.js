const { Client, Events, Collection, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { token, prefix, applicationId, clientId, guildId, apiToken, apiCalendar, channels, apiMembers } = require('./config.json');

const fs = require('fs');
const path = require('path');
const moment = require('moment');

const { OAuthClient } = require("@timetreeapp/web-api");
const { assert } = require('console');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
    shards: 'auto'
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

const apiClient = new OAuthClient(apiToken);

let date = new Date();
let day = date.getDay() || 7;

const daysMap = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1, 6: 7, 7: 6 };

const MAX_HOUR = "20:00";
const MIN_HOUR = "8:00";

/**
 * ^
 * |- Global constants and variables
 * 
 * |- Global functions
 * v
 */

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    // Set a new item in the Collection with the key as the command name and the value as the exported module
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

/**
 * timer - Check every hour if the day has changed and if the day is a monday or sunday
 */
async function timer() {

    setInterval(() => {
        const currentDate = new Date();
        const currentDay = currentDate.getDay() || 7;

        if (currentDay !== day) {

            if (currentDay === 7 || currentDay === 1) {

                checkMembersCalendar(daysMap[currentDay]);
            }

            newWeekCalendar(daysMap[currentDay]);

            day = currentDay;
        }
    }, 1000 /** 60 * 60*/); // 1 hour
}

/**
 * getWeekSchedule - Get the schedule of the week from the API and format it to be used in the calendar embed message 
 * @returns {Promise<Object>} The schedule of the week
 */
async function getWeekSchedule(daysMap) {

    const data = await apiClient.getUpcomingEvents({ calendarId: apiCalendar, days: daysMap });
    const schedule = {};

    data.forEach(event => {

        const startAt = new Date(Date.parse(event.startAt));
        const endAt = new Date(Date.parse(event.endAt));

        const dayOfWeek = startAt.getDay() || 7;

        // if the event is not initialized for the day
        if (!schedule[dayOfWeek]) {
            schedule[dayOfWeek] = { open: [], close: [] };
        }

        // if the event starts before 8h
        if (startAt.getHours < 8) {
            schedule[startAt.getDay || 7].open.push(MIN_HOUR);
        }

        // if the event ends after 20h
        if (startAt.getHours > 20) {
            schedule[startAt.getDay || 7].open.push(MAX_HOUR);
        }

        // if the event don't start at the same day as the event end
        if ((startAt.getDay || 7) > (endAt.getDay || 7)) {
            schedule[startAt.getDay || 7].open.push(MIN_HOUR);
        }

        // if the event don't start at the same day as the event end
        if ((startAt.getDay || 7) < (endAt.getDay || 7)) {
            schedule[startAt.getDay || 7].open.push(MAX_HOUR);
        }

        // check for duplicates for the open
        if (!schedule[dayOfWeek].open.includes(moment(startAt).format('HH:mm'))) {
            schedule[dayOfWeek].open.push(moment(startAt).format('HH:mm'));
        }

        // check for duplicates for the close
        if (!schedule[dayOfWeek].close.includes(moment(endAt).format('HH:mm'))) {
            schedule[dayOfWeek].close.push(moment(endAt).format('HH:mm'));
        }
    });

    if (schedule != {}) {

        for (let i = 1; i < 7; i++) {
            if (schedule[i]) {
                // sort the schedule
                schedule[i].open.sort();
                schedule[i].close.sort();

                // check if there are as much open as close
                if (schedule[i].open.length > schedule[i].close.length) {
                    console.log(`[WARNING] There are more open than close for the day ${i}`);
                }
            } else {

                schedule[i] = { open: ["BDE fermé"], close: ["BDE fermé"] };
            }
        }

        return schedule;
    } else {

        console.log("[WARNING] There is no schedule for the next 7 days");
        return null;
    }
}

/**
 * newWeekCalendar - Create a new calendar embed message for the week and send it to the channel
 * @param {String} channel The channel where the message will be sent
 * @param {EmbedBuilder} messageEmbed The embed message to send
 */
async function newWeekCalendar(channel = channels.informations["ouvertures-fermetures"]) {

    const schedule = await getWeekSchedule();

    assert(schedule != null, "[ERROR] There is no schedule for the next 7 days");

    /*
    see if there is a break in the schedule between 2 events
    if there is a break, add a field with the break like this : open - close | open - close | open - close ...
    */
    for (let i = 1; i < 7; i++) {

        if (schedule[i]) {

            let scheduleString = "";

            for (let j = 0; j < schedule[i].open.length; j++) {

                if (schedule[i].open[j] === "BDE fermé") {
                    scheduleString += schedule[i].open[j];
                } else {

                    scheduleString += `${schedule[i].open[j]} - ${schedule[i].close[j]}`;

                    if (j < schedule[i].open.length - 1) {

                        scheduleString += " | ";
                    }
                }
            }

            schedule[i].open = [scheduleString];
        }
    }

    const newWeekCalendarEmbed = new EmbedBuilder()
        .setTitle(`Horaire de la semaine du ${date.getDate()}/${date.getMonth() + 1} au ${date.getDate() + 6}/${date.getMonth() + 1}`)
        .setDescription(`Voici les horaires d'ouverture du BDE de la semaine du ${date.getDate()}/${date.getMonth() + 1} au ${date.getDate() + 6}/${date.getMonth() + 1}`)
        .addFields(
            { name: 'Lundi', value: `${schedule[1].open}`, inline: false },
            { name: 'Mardi', value: `${schedule[2].open}`, inline: false },
            { name: 'Mercredi', value: `${schedule[3].open}`, inline: false },
            { name: 'Jeudi', value: `${schedule[4].open}`, inline: false },
            { name: 'Vendredi', value: `${schedule[5].open}`, inline: false },
        )
        .setColor("#007bff")
        .setFooter({ text: "BDEBot", iconURL: "https://cdn.discordapp.com/avatars/1083735413656670288/044883718613200c99443965ca8eea0a.webp" })
        .setTimestamp(new Date())
        .setThumbnail("https://cdn.discordapp.com/avatars/1083735413656670288/044883718613200c99443965ca8eea0a.webp");


    client.guilds.cache.find(guild => guild.id === guildId).channels.cache.find(channel => channel.id === channels.informations["ouvertures-fermetures"]).bulkDelete(1);

    client.guilds.cache.find(guild => guild.id === guildId).channels.cache.find(channel => channel.id === channels.informations["ouvertures-fermetures"]).send({ embeds: [newWeekCalendarEmbed] })

    console.log("[INFO] New week calendar edited");
}

/**
 * checkMembersCalendar - Check if there is an event in the next 7 days for each member
 * @param {Number} daysMap The number of days to check
 */
async function checkMembersCalendar(daysMap) {

    const apiMembersCalendar = await apiClient.getMembers(apiCalendar);
    const apiUpcomingEvents = await apiClient.getUpcomingEvents({ calendarId: apiCalendar, days: daysMap });

    const members = {};

    apiMembersCalendar.forEach(member => {

        if (!members[member.id]) {
            members[member.id] = { hasEvent: false };
        }
    });

    apiUpcomingEvents.forEach(event => {

        const member = event.creator.id;

        if (members[member]) {
            members[member].hasEvent = true;
        }
    });

    apiMembersCalendar.forEach(async member => {

        if (!members[member.id].hasEvent) {

            if (typeof apiMembers[member.id] !== 'undefined') {

                const ttest = await (await client.guilds.cache.find(guild => guild.id === guildId).members.fetch(apiMembers[member.id].discordId)).send("Ceci est un test : Bonjour, vous n'avez pas d'événement dans les prochains jours, pensez à en créer un !")

                console.log(`[INFO] Message sent to ${member.name} (${member.id})`);
            }
        }
    });
}


/**
 * ^
 * |- Global functions
 * 
 * |- Global events
 * v
 */

client.on(Events.ClientReady, async () => {

    timer();

    checkMembersCalendar(daysMap[day]);

    console.log("BDEBot is ready!");
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.isCommand()) {

        const commandName = interaction.commandName;

        if (commandName === "updatecalendar") {

            await interaction.reply('Mise à jour du calendrier en cours...', { ephemeral: true });
            await newWeekCalendar();
            await interaction.editReply('Mise à jour du calendrier terminée !', { ephemeral: true });
        }
    }
});

client.on(Events.MessageCreate, async message => {

    if (message.author.bot) return;

    if (message.content.startsWith(prefix + "test")) {
        newWeekCalendar();
    }

});

client.login(token);