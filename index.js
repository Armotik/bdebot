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
const daysMapEmbed = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 7, 7: 6 };

const MAX_HOUR = "20:00";
const MIN_HOUR = "8:00";

let members = {};

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

    // check every hour if the day has changed
    setInterval(() => {
        const currentDate = new Date();
        const currentDay = currentDate.getDay() || 7;

        // if the day has changed
        if (currentDay !== day) {

            // if the day is a monday or sunday
            if (currentDay === 7 || currentDay === 1) {

                checkMembersCalendar(daysMap[currentDay]);
            }

            // if the day is a saturday
            if (currentDay === 6) {

                initMembers();
            }

            newWeekCalendar(daysMap[currentDay]);

            day = currentDay;
        }
    }, 1000 * 60 * 60); // 1 hour
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

    // if there is a schedule for the next 7 days
    if (schedule != {}) {

        for (let i = 1; i < 7; i++) {

            // if there is a schedule for the day
            if (schedule[i]) {
                // sort the schedule
                schedule[i].open.sort();
                schedule[i].close.sort();

                // if the first event of the day is a close
                if (schedule[i].open[0] > schedule[i].close[0]) {
                    schedule[i].open.unshift(MIN_HOUR);
                }

                // if the last event of the day is an open
                if (schedule[i].open[schedule[i].open.length - 1] < schedule[i].close[schedule[i].close.length - 1]) {

                    schedule[i].close.push(schedule[i].close[schedule[i].close.length - 1]);
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
async function newWeekCalendar(channelSend = channels.informations["ouvertures-fermetures"]) {

    const schedule = await getWeekSchedule(daysMap[day]);

    assert(schedule != null, "[ERROR] There is no schedule for the next 7 days");

    /*
    see if there is a break in the schedule between 2 events
    if there is a break (period without any schedule), add a field with the break like this : open - close | open - close | open - close ...
    */
    for (let i = 1; i < 7; i++) {

        // if there is a schedule for the day
        if (schedule[i]) {

            let scheduleString = "";

            const open = schedule[i]?.open;
            const close = schedule[i]?.close;

            if (!open || !close) {
                continue;
            }

            const hours = [];

            for (let j = 0; j < open.length; j++) {
                const openTime = open[j];
                const closeTime = close[j];

                if (hours.length === 0) {

                    hours.push(`${openTime} - ${closeTime}`);
                } else {

                    const [lastStart, lastEnd] = hours[hours.length - 1].split(" - ");

                    if (lastEnd >= openTime) {

                        if (lastEnd >= closeTime) {
                            continue;

                        } else {
                            hours[hours.length - 1] = `${lastStart} - ${closeTime}`;
                        }
                        
                    } else {
                        hours.push(`${openTime} - ${closeTime}`);
                    }
                }
            }

            for (let j = 0; j < hours.length; j++) {
                scheduleString += hours[j];

                if (j < hours.length - 1) {
                    scheduleString += " | ";
                }
            }

            schedule[i].open = scheduleString;
        }
    }

    [1, 2, 3, 4, 5]

    const newWeekCalendarEmbed = new EmbedBuilder()
        .setTitle(`Horaire de la semaine du ${date.getDate() - daysMapEmbed[day]}/${date.getMonth() + 1}`)
        .setDescription(`Voici les horaires d'ouverture du BDE de la semaine du ${date.getDate() - daysMapEmbed[day]}/${date.getMonth() + 1}`)
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


    client.guilds.cache.find(guild => guild.id === guildId).channels.cache.find(channel => channel.id === channelSend).bulkDelete(1);

    client.guilds.cache.find(guild => guild.id === guildId).channels.cache.find(channel => channel.id === channelSend).send({ embeds: [newWeekCalendarEmbed] })

    console.log("[INFO] New week calendar edited");
}

/**
 * checkMembersCalendar - Check if there is an event in the next 7 days for each member
 * @param {Number} daysMap The number of days to check
 */
async function checkMembersCalendar(daysMap) {

    const apiMembersCalendar = await apiClient.getMembers(apiCalendar);
    const apiUpcomingEvents = await apiClient.getUpcomingEvents({ calendarId: apiCalendar, days: daysMap });

    apiUpcomingEvents.forEach(event => {

        const member = event.creator.id;

        // if the member has an event in the next 7 days set hasEvent to true
        if (members[member]) {
            members[member].hasEvent = true;

            console.log(`[INFO] ${members[member].name} (${member}) has an event in the next ${daysMap} days`);
        }
    });

    apiMembersCalendar.forEach(async member => {

        // if the member has no event in the next 7 days send him a message to create one
        if (!members[member.id].hasEvent) {

            // if the member is in the discord server send him a message
            if (typeof apiMembers[member.id] !== 'undefined') {

                await (await client.guilds.cache.find(guild => guild.id === guildId).members.fetch(apiMembers[member.id].discordId)).send("Bonjour, vous n'avez pas d'événement dans les prochains jours, pensez à en créer un !")

                console.log(`[INFO] Message sent to ${member.name} (${member.id})`);
            }
        }
    });
}

/**
 * initMembers - Initialize the members list with a hasEvent property set to false by default (no event in the next 7 days) for each member in the calendar
 */
async function initMembers() {

    // clear the members list
    members = {};

    const apiMembersCalendar = await apiClient.getMembers(apiCalendar);

    // add each member to the members list with a hasEvent property set to false by default (no event in the next 7 days)
    apiMembersCalendar.forEach(member => {

        // if the member is not in the members list
        if (!members[member.id]) {
            members[member.id] = { hasEvent: false };

            console.log(`[INFO] Member ${member.name} (${member.id}) added to the members list`);
        }
    });
}

/**
 * changeStatus - Change the status of a member in the members list (hasEvent property) to true (has an event in the next 7 days)
 * @param {Number} discordId 
 */
async function changeStatus(discordId) {

    const apiMembersCalendar = await apiClient.getMembers(apiCalendar);

    apiMembersCalendar.forEach(member => {

        // if the member is in the members list
        if (members[member.id]) {

            // if the member is defined in the apiMembers list
            if (typeof apiMembers[member.id] !== 'undefined') {

                const memberDiscordId = apiMembers[member.id].discordId;

                // if the member is the one we are looking for (discordId) then change the hasEvent property to true (has an event in the next 7 days) and log it
                if (memberDiscordId === discordId) {

                    members[member.id] = { hasEvent: true };

                    console.log(`[INFO] Member ${member.name} (${member.id}) is not available this week`);
                }
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

    initMembers();

    timer();

    console.log("BDEBot is ready!");
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.isCommand()) {

        const commandName = interaction.commandName;

        if (commandName === "updatecalendar") {

            await interaction.reply('Mise à jour du calendrier en cours...', { ephemeral: true });
            await newWeekCalendar(channels.informations['ouvertures-fermetures']);
            await interaction.editReply('Mise à jour du calendrier terminée !', { ephemeral: true });
        }

        else if (commandName === "notavailable") {

            await interaction.reply('Mise à jour de votre disponibilité en cours...', { ephemeral: true });

            changeStatus(interaction.user.id);

            await interaction.editReply('Mise à jour de votre disponibilité terminée !', { ephemeral: true });
        }

        else if (commandName == "pingmembers") {

            await interaction.reply('Ping des membres en cours...', { ephemeral: true });

            checkMembersCalendar(daysMap[day]);

            await interaction.editReply('Ping des membres terminé !', { ephemeral: true });
        }
    }
});

client.on(Events.MessageCreate, async message => {

    // if the message is sent by a bot, ignore it
    if (message.author.bot) return;

    // if the message doesn't start with the prefix, ignore it
    if (message.content.startsWith(prefix + "test") && message.member.permissions.has("Administrator")) {
        //newWeekCalendar();
    }

});

client.login(token);