const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
	name: 'updatecalendar',
	data: new SlashCommandBuilder()
		.setName('updatecalendar')
		.setDescription('Mets à jour le calendrier des ouvertures et fermetures de la semaine')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),
	async execute(interaction) {
			
	},
};
