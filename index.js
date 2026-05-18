require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ApplicationCommandOptionType } = require('discord.js');
const express = require('express');

const mySecretToken = process.env.DISCORD_TOKEN;

// =====================================================================
// WEB SERVER (For Render 24/7 Hosting)
// =====================================================================
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Jartex Stats Bot is alive and API-connected!'));
app.listen(port, () => console.log(`Web server listening on port ${port}`));

// =====================================================================
// BOT SETUP & COMMAND REGISTRATION
// =====================================================================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  { name: 'ping', description: 'Replies with a ping!' },
  {
    name: 'stats',
    description: 'Get the overall stats of a specific player',
    options: [{ name: 'username', description: 'Minecraft username', type: ApplicationCommandOptionType.String, required: true }]
  },
  {
    name: 'clan',
    description: 'Get clan stats, trophies, and leader info',
    options: [{ name: 'clanname', description: 'Exact clan name', type: ApplicationCommandOptionType.String, required: true }]
  },
  {
    name: 'recaps',
    description: 'View a game recap using a match UUID',
    options: [{ name: 'uuid', description: 'The specific match UUID', type: ApplicationCommandOptionType.String, required: true }]
  },
  {
    name: 'recent',
    description: 'View the most recent game of a player',
    options: [{ name: 'username', description: 'Minecraft username', type: ApplicationCommandOptionType.String, required: true }]
  },
  {
    name: 'clanlb',
    description: 'View the top 10 clans this season',
  }
];

client.once('ready', async () => {
  console.log(`Victory! Logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(mySecretToken);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash commands registered successfully!');
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
});

// =====================================================================
// API COMMAND LOGIC
// =====================================================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // --- /PING ---
  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong! The API bridge is active.');
  }

  // --- /STATS (API CONNECTED) ---
  else if (interaction.commandName === 'stats') {
    const player = interaction.options.getString('username');
    await interaction.deferReply(); 

    try {
      // Fetch Core Profile
      const profileRes = await fetch(`https://stats.jartexnetwork.com/api/profile/${player}`);
      if (!profileRes.ok) return await interaction.editReply(`❌ Could not find player **${player}** on JartexNetwork.`);
      const profileData = await profileRes.json();

      // Fetch Bedwars Stats
      const statsRes = await fetch(`https://stats.jartexnetwork.com/api/profile/${player}/leaderboard?type=bedwars&interval=total&mode=ALL_MODES`);
      const statsData = statsRes.ok ? await statsRes.json() : {};

      // Parse safely (Jartex API can return weird structures if a stat is 0)
      const rank = profileData.rank?.name || 'Default';
      const level = profileData.level || 0;
      const clanName = profileData.clan?.name || 'None';
      
      // Helper to pull stats without crashing if the stat doesn't exist yet
      const getStat = (key) => statsData[key]?.entries || statsData.entries?.[key] || statsData[key] || '0';

      const statsEmbed = new EmbedBuilder()
        .setTitle(`📊 Jartex Stats: ${profileData.username || player}`)
        .setColor('#00FF00')
        .setThumbnail(`https://minotar.net/helm/${player}/100.png`) // Gets their real Minecraft face!
        .addFields(
          { name: '🎖️ Rank', value: `${rank}`, inline: true },
          { name: '⭐ Level', value: `${level}`, inline: true },
          { name: '🛡️ Clan', value: `${clanName}`, inline: true },
          { name: '⚔️ Kills', value: `${getStat('kills')}`, inline: true },
          { name: '💀 Final Kills', value: `${getStat('final_kills')}`, inline: true },
          { name: '☠️ Deaths', value: `${getStat('deaths')}`, inline: true },
          { name: '🛏️ Beds Destroyed', value: `${getStat('beds_destroyed')}`, inline: true },
          { name: '🏆 Wins', value: `${getStat('wins')}`, inline: true },
          { name: '🎮 Games Played', value: `${getStat('games_played')}`, inline: true }
        )
        .setFooter({ text: 'Live API Data • JartexNetwork' })
        .setTimestamp();

      await interaction.editReply({ embeds: [statsEmbed] });
    } catch (error) {
      console.error(error);
      await interaction.editReply('⚠️ Error connecting to the Jartex API. They might be rate-limiting the bot.');
    }
  }

  // --- /CLAN (API CONNECTED) ---
  else if (interaction.commandName === 'clan') {
    const clanInput = interaction.options.getString('clanname');
    await interaction.deferReply();

    try {
      const clanRes = await fetch(`https://stats.jartexnetwork.com/api/clans/${clanInput}`);
      if (!clanRes.ok) return await interaction.editReply(`❌ Could not find clan **${clanInput}**.`);
      const clanData = await clanRes.json();

      const clanEmbed = new EmbedBuilder()
        .setTitle(`🛡️ Clan Profile: ${clanData.name || clanInput}`)
        .setColor('#FF00AA')
        .addFields(
          { name: '👑 Leader', value: `${clanData.owner?.username || 'Unknown'}`, inline: true },
          { name: '⭐ Level', value: `${clanData.level || 1}`, inline: true },
          { name: '👥 Members', value: `${clanData.members?.length || 0}`, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [clanEmbed] });
    } catch (error) {
      console.error(error);
      await interaction.editReply('⚠️ Error fetching clan data.');
    }
  }

  // --- /RECAPS & /RECENT & /CLANLB ---
  // Note: These endpoints are heavily restricted/hidden by Jartex. 
  // We ping the most likely endpoints, but gracefully catch errors if Jartex blocks them.
  else if (interaction.commandName === 'recaps' || interaction.commandName === 'recent' || interaction.commandName === 'clanlb') {
    await interaction.deferReply();
    
    // I am setting these up as placeholders for right now. 
    // Finding the undocumented endpoints for exact match UUID recaps takes deep API digging.
    const devEmbed = new EmbedBuilder()
      .setTitle(`🚧 Command in Development`)
      .setDescription(`The API endpoints for **${interaction.commandName}** are hidden or undocumented by JartexNetwork. We successfully wired up the command, but we need to intercept the specific API routes before this can pull live data.`)
      .setColor('#FFA500');

    await interaction.editReply({ embeds: [devEmbed] });
  }
});

client.login(mySecretToken);
