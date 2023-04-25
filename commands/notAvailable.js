const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
	name: 'notavailable',
	data: new SlashCommandBuilder()
		.setName('notavailable')
		.setDescription('Se définit comme indisponible pour la semaine')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),
	async execute(interaction) {
			
	},
};