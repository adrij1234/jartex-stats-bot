require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder, ApplicationCommandOptionType } = require('discord.js');
const express = require('express');

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN missing in environment variables.");
    process.exit(1);
}

// =====================================================================
// 1. HELPER FUNCTIONS (API Retries & Safe Data)
// =====================================================================
const JARTEX_API = 'https://stats.jartexnetwork.com/api';

async function fetchWithRetry(endpoint, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(`${JARTEX_API}${endpoint}`);
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error(`API Error on ${endpoint} (Attempt ${i + 1}):`, error);
            if (i === retries - 1) return null;
        }
    }
}

function safeStat(data, key) {
    if (!data) return "0";
    if (Array.isArray(data)) {
        const found = data.find(x => x.name === key || x.id === key || x.stat === key);
        return found ? Number(found.value || found.amount || 0).toLocaleString() : "0";
    }
    const val = data[key]?.value || data[key] || 0;
    return Number(val).toLocaleString();
}

// =====================================================================
// 2. WEB SERVER (For Render 24/7 Hosting)
// =====================================================================
const app = express();
app.get('/', (req, res) => res.send('Jartex Stats Bot is Online & Scraping!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌍 Web server running on port ${PORT}`));

// =====================================================================
// 3. COMMAND DEFINITIONS
// =====================================================================
const commands = [
    {
        name: 'ping',
        description: 'Check bot latency and API status'
    },
    {
        name: 'stats',
        description: 'Get player Bedwars stats',
        options: [{ name: 'username', description: 'Minecraft username', type: ApplicationCommandOptionType.String, required: true }]
    },
    {
        name: 'clan',
        description: 'Get clan information',
        options: [{ name: 'name', description: 'Exact clan name', type: ApplicationCommandOptionType.String, required: true }]
    },
    {
        name: 'recent',
        description: 'View the most recent game of a player',
        options: [{ name: 'username', description: 'Minecraft username', type: ApplicationCommandOptionType.String, required: true }]
    },
    {
        name: 'clanlb',
        description: 'Top 5 Clans this season (Scraped via Player Leaderboards)'
    }
];

// =====================================================================
// 4. BOT SETUP & EVENTS
// =====================================================================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    console.log(`✅ Logged in safely as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('Registering slash commands...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Slash commands registered successfully!');
    } catch (error) {
        console.error('Failed to register commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    try {
        // --- PING ---
        if (interaction.commandName === 'ping') {
            const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
            const latency = sent.createdTimestamp - interaction.createdTimestamp;
            await interaction.editReply(`🏓 Pong! Bot Latency: \`${latency}ms\` | API Latency: \`${interaction.client.ws.ping}ms\``);
        }

        // --- STATS ---
        else if (interaction.commandName === 'stats') {
            const username = interaction.options.getString('username');
            await interaction.deferReply();

            const profile = await fetchWithRetry(`/profile/${username}`);
            if (!profile) return interaction.editReply(`❌ Player \`${username}\` not found.`);

            const bwStats = await fetchWithRetry(`/profile/${username}/leaderboard?type=bedwars&interval=total&mode=ALL_MODES`);

            const embed = new EmbedBuilder()
                .setColor('#00ff99')
                .setTitle(`📊 Stats for ${profile.username || username}`)
                .setThumbnail(`https://mc-heads.net/avatar/${username}`)
                .addFields(
                    { name: '🎖 Rank', value: profile.rank?.name || 'Default', inline: true },
                    { name: '⭐ Level', value: String(profile.level || 0), inline: true },
                    { name: '🛡 Clan', value: profile.clan?.name || 'None', inline: true },
                    { name: '⚔ Kills', value: safeStat(bwStats, 'kills'), inline: true },
                    { name: '🏆 Wins', value: safeStat(bwStats, 'wins'), inline: true },
                    { name: '🛏 Beds Destroyed', value: safeStat(bwStats, 'beds_destroyed'), inline: true }
                )
                .setFooter({ text: 'JartexNetwork Stats' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }

        // --- CLAN ---
        else if (interaction.commandName === 'clan') {
            const clanName = interaction.options.getString('name');
            await interaction.deferReply();

            const clan = await fetchWithRetry(`/clans/${clanName}`);
            if (!clan) return interaction.editReply(`❌ Clan \`${clanName}\` not found.`);

            let membersList = clan.members?.map(m => m.username || m).join(', ') || 'None';
            if (membersList.length > 1000) {
                membersList = membersList.substring(0, 1000) + '... (Too many to display)';
            }

            const embed = new EmbedBuilder()
                .setColor('#ff0099')
                .setTitle(`🛡 Clan Profile: ${clan.name}`)
                .addFields(
                    { name: '👑 Owner', value: clan.owner?.username || 'Unknown', inline: true },
                    { name: '🏆 Trophies', value: Number(clan.trophies || 0).toLocaleString(), inline: true },
                    { name: '⭐ Level', value: String(clan.level || 1), inline: true },
                    { name: '✨ Clan EXP', value: Number(clan.exp || clan.xp || 0).toLocaleString(), inline: true },
                    { name: `👥 Members (${clan.members?.length || 0})`, value: membersList }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }

        // --- RECENT ---
        else if (interaction.commandName === 'recent') {
            const username = interaction.options.getString('username');
            await interaction.deferReply();

            const profile = await fetchWithRetry(`/profile/${username}`);
            if (!profile) return interaction.editReply(`❌ Player \`${username}\` not found.`);

            const recentGames = profile.recentGames || profile.matches || [];
            if (recentGames.length === 0) {
                return interaction.editReply(`❌ No recent match data available for **${username}** right now. Jartex hides this for most players.`);
            }

            const latestMatch = recentGames[0];
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle(`🕒 Most Recent Game for ${username}`)
                .addFields(
                    { name: '🎮 Mode', value: String(latestMatch.mode || latestMatch.gameType || 'Unknown'), inline: true },
                    { name: '🗺️ Map', value: String(latestMatch.map || 'Unknown'), inline: true },
                    { name: '⚔️ Kills', value: String(latestMatch.kills || 0), inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }

        // --- CLANLB ---
        else if (interaction.commandName === 'clanlb') {
            await interaction.deferReply();

            const lbData = await fetchWithRetry('/leaderboard/bedwars/level');
            if (!lbData) return interaction.editReply('❌ Could not fetch leaderboards.');
            
            const players = lbData.data || lbData || [];
            const clanMap = new Map();
            
            for (const player of players) {
                if (player.clan && player.clan.name) {
                    const cName = player.clan.name;
                    if (!clanMap.has(cName)) {
                        clanMap.set(cName, {
                            name: cName,
                            trophies: player.clan.trophies || 0,
                            level: player.clan.level || 1
                        });
                    }
                }
            }

            const top5 = Array.from(clanMap.values()).sort((a, b) => b.trophies - a.trophies).slice(0, 5);
            if (top5.length === 0) return interaction.editReply('❌ Scraper found no clan data.');

            let desc = '';
            const medals = ['🥇', '🥈', '🥉', '🏅', '🏅'];
            top5.forEach((clan, i) => {
                desc += `**${medals[i]} \`${clan.name}\`**\n↳ 🏆 **${clan.trophies.toLocaleString()}** Trophies | ⭐ Level ${clan.level}\n\n`;
            });

            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`🏆 Top 5 Scraped Clans (By Trophies)`)
                .setDescription(desc)
                .setFooter({ text: 'Compiled by scraping top players' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }

    } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: '⚠️ Command crashed internally!', ephemeral: true });
        } else {
            await interaction.reply({ content: '⚠️ Command crashed internally!', ephemeral: true });
        }
    }
});

// =====================================================================
// 5. ANTI-CRASH PROTECTION
// =====================================================================
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚫 Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('🚫 Uncaught Exception:', err);
});

client.login(TOKEN);
