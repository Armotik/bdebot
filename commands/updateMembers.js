const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
	name: 'updatemembers',
	data: new SlashCommandBuilder()
		.setName('updatemembers')
		.setDescription('Mets à jour les membres du TimeTree')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
			
	},
};