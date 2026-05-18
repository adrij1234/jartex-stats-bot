require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ApplicationCommandOptionType } = require('discord.js');
const express = require('express');

const mySecretToken = process.env.DISCORD_TOKEN;

// =====================================================================
// WEB SERVER
// =====================================================================
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Jartex Stats Bot is alive and scraping APIs!'));
app.listen(port, () => console.log(`Web server listening on port ${port}`));

// =====================================================================
// BOT SETUP & COMMANDS
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
    description: 'Get clan stats, trophies, members, and leader info',
    options: [{ name: 'clanname', description: 'Exact clan name', type: ApplicationCommandOptionType.String, required: true }]
  },
  {
    name: 'recent',
    description: 'View the most recent game of a player',
    options: [{ name: 'username', description: 'Minecraft username', type: ApplicationCommandOptionType.String, required: true }]
  },
  {
    name: 'clanlb',
    description: 'Top 5 Clans this season (Scraped via Player Leaderboards)',
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

  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong! API scrapers are fully online.');
  }

  // --- /STATS ---
  else if (interaction.commandName === 'stats') {
    const player = interaction.options.getString('username');
    await interaction.deferReply(); 

    try {
      const profileRes = await fetch(`https://stats.jartexnetwork.com/api/profile/${player}`);
      if (!profileRes.ok) return await interaction.editReply(`❌ Could not find player **${player}** on JartexNetwork.`);
      const profileData = await profileRes.json();

      // Fetch Bedwars Stats
      const statsRes = await fetch(`https://stats.jartexnetwork.com/api/profile/${player}/leaderboard?type=bedwars&interval=total&mode=ALL_MODES`);
      const statsData = statsRes.ok ? await statsRes.json() : {};

      const rank = profileData.rank?.name || 'Default';
      const level = profileData.level || 0;
      const clanName = profileData.clan?.name || 'None';
      
      // AGGRESSIVE STAT FINDER (Fixes the "0" issue)
      // Checks if Jartex returned an array, an object, or nested entries.
      const getStat = (statName) => {
        let value = 0;
        if (Array.isArray(statsData)) {
            const found = statsData.find(s => s.id === statName || s.stat === statName || s.name === statName);
            if (found) value = found.value || found.amount || 0;
        } else if (statsData[statName]) {
            value = statsData[statName].value || statsData[statName] || 0;
        } else if (statsData.entries && statsData.entries[statName]) {
            value = statsData.entries[statName];
        }
        // Format with commas (e.g., 1,000)
        return value.toLocaleString();
      };

      const statsEmbed = new EmbedBuilder()
        .setTitle(`📊 Jartex Stats: ${profileData.username || player}`)
        .setColor('#00FF00')
        .setThumbnail(`https://minotar.net/helm/${player}/100.png`)
        .addFields(
          { name: '🎖️ Rank', value: `${rank}`, inline: true },
          { name: '⭐ Level', value: `${level}`, inline: true },
          { name: '🛡️ Clan', value: `${clanName}`, inline: true },
          { name: '⚔️ Kills', value: getStat('kills'), inline: true },
          { name: '💀 Final Kills', value: getStat('final_kills'), inline: true },
          { name: '☠️ Deaths', value: getStat('deaths'), inline: true },
          { name: '🛏️ Beds Destroyed', value: getStat('beds_destroyed'), inline: true },
          { name: '🏆 Wins', value: getStat('wins'), inline: true },
          { name: '🎮 Games Played', value: getStat('played'), inline: true }
        )
        .setFooter({ text: 'Live API Data • JartexNetwork' })
        .setTimestamp();

      await interaction.editReply({ embeds: [statsEmbed] });
    } catch (error) {
      console.error(error);
      await interaction.editReply('⚠️ Error connecting to the Jartex API. They might be rate-limiting the bot.');
    }
  }

  // --- /CLAN ---
  else if (interaction.commandName === 'clan') {
    const clanInput = interaction.options.getString('clanname');
    await interaction.deferReply();

    try {
      const clanRes = await fetch(`https://stats.jartexnetwork.com/api/clans/${clanInput}`);
      if (!clanRes.ok) return await interaction.editReply(`❌ Could not find clan **${clanInput}**.`);
      const clanData = await clanRes.json();

      // Extract precise clan stats
      const leader = clanData.owner?.username || clanData.leader?.username || 'Unknown';
      const level = clanData.level || clanData.tier || 1;
      const exp = (clanData.exp || clanData.xp || 0).toLocaleString();
      const trophies = (clanData.trophies || 0).toLocaleString();
      
      // Parse members safely and limit to 50 so it doesn't crash Discord embeds
      let memberList = 'None';
      if (clanData.members && Array.isArray(clanData.members)) {
          const names = clanData.members.map(m => m.username || m.name || m);
          // If there are too many members, cut it off and add "..."
          memberList = names.length > 50 ? names.slice(0, 50).join(', ') + '...' : names.join(', ');
      }

      const clanEmbed = new EmbedBuilder()
        .setTitle(`🛡️ Clan Profile: ${clanData.name || clanInput}`)
        .setColor('#FF00AA')
        .addFields(
          { name: '👑 Leader', value: `${leader}`, inline: true },
          { name: '⭐ Level', value: `${level}`, inline: true },
          { name: '🏆 Trophies', value: `${trophies}`, inline: true },
          { name: '✨ Clan EXP', value: `${exp}`, inline: true },
          { name: '👥 Member Count', value: `${clanData.members?.length || 0}`, inline: true },
          { name: '📜 Members Roster', value: `\`\`\`\n${memberList}\n\`\`\``, inline: false } // Creates a nice code block for members
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [clanEmbed] });
    } catch (error) {
      console.error(error);
      await interaction.editReply('⚠️ Error fetching clan data.');
    }
  }

  // --- /RECENT ---
  else if (interaction.commandName === 'recent') {
    const player = interaction.options.getString('username');
    await interaction.deferReply();

    try {
      const profileRes = await fetch(`https://stats.jartexnetwork.com/api/profile/${player}`);
      if (!profileRes.ok) return await interaction.editReply(`❌ Could not find player **${player}**.`);
      const profileData = await profileRes.json();

      // Attempt to find recent games in the profile payload
      const recentGames = profileData.recentGames || profileData.matches || [];
      
      if (recentGames.length === 0) {
          return await interaction.editReply(`❌ No recent match data available for **${player}** right now.`);
      }

      const latestMatch = recentGames[0]; // Get the very first one

      const recentEmbed = new EmbedBuilder()
        .setTitle(`🕒 Most Recent Game for ${player}`)
        .setColor('#FFA500')
        .addFields(
          { name: '🎮 Mode', value: `${latestMatch.mode || latestMatch.gameType || 'Unknown'}`, inline: true },
          { name: '🗺️ Map', value: `${latestMatch.map || 'Unknown'}`, inline: true },
          { name: '⚔️ Kills', value: `${latestMatch.kills || 0}`, inline: true }
        )
        .setFooter({ text: 'JartexNetwork Match History' })
        .setTimestamp();

      await interaction.editReply({ embeds: [recentEmbed] });
    } catch (error) {
      console.error(error);
      await interaction.editReply('⚠️ Error fetching recent match data.');
    }
  }

  // --- /CLANLB (THE REVERSE-ENGINEERED SCRAPER) ---
  else if (interaction.commandName === 'clanlb') {
    await interaction.deferReply();

    try {
      // 1. Fetch the top bedwars players
      const lbRes = await fetch('https://stats.jartexnetwork.com/api/leaderboard/bedwars/level');
      if (!lbRes.ok) return await interaction.editReply('❌ Could not fetch player leaderboards to build clan data.');
      
      const lbData = await lbRes.json();
      const players = lbData.data || lbData || [];
      
      // 2. Extract clans from those top players
      const clanMap = new Map();
      
      for (const player of players) {
          if (player.clan && player.clan.name) {
              const clanName = player.clan.name;
              // If we haven't tracked this clan yet, add it
              if (!clanMap.has(clanName)) {
                  clanMap.set(clanName, {
                      name: clanName,
                      trophies: player.clan.trophies || 0,
                      level: player.clan.level || 1
                  });
              }
          }
      }

      // 3. Convert Map to Array and Sort by Trophies (Highest to Lowest)
      const sortedClans = Array.from(clanMap.values()).sort((a, b) => b.trophies - a.trophies);
      const top5 = sortedClans.slice(0, 5); // Take top 5

      if (top5.length === 0) {
          return await interaction.editReply('❌ Could not scrape any clan data from the current leaderboards.');
      }

      // 4. Build the dynamic leaderboard string
      let description = '';
      const medals = ['🥇', '🥈', '🥉', '🏅', '🏅'];
      
      top5.forEach((clan, index) => {
          description += `**${medals[index]} \`${clan.name}\`**\n`;
          description += `↳ 🏆 **${clan.trophies.toLocaleString()}** Trophies | ⭐ Level ${clan.level}\n\n`;
      });

      const lbEmbed = new EmbedBuilder()
        .setTitle(`🏆 Top 5 Scraped Clans (By Trophies)`)
        .setColor('#FFD700') // Gold
        .setDescription(description)
        .setFooter({ text: `Compiled by analyzing top players • JartexNetwork` })
        .setTimestamp();

      await interaction.editReply({ embeds: [lbEmbed] });

    } catch (error) {
      console.error(error);
      await interaction.editReply('⚠️ Scraper failed. The API might have changed its leaderboard structure.');
    }
  }

});

client.login(mySecretToken);
