const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
	name: 'pingmembers',
	data: new SlashCommandBuilder()
		.setName('pingmembers')
		.setDescription('Lance la fonction checkMembers')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),
	async execute(interaction) {
			
	},
};