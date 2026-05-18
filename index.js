require('dotenv').config();

const express = require('express');
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  EmbedBuilder,
  ApplicationCommandOptionType
} = require('discord.js');

// =====================================================
// ENV
// =====================================================
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // optional but recommended
const GUILD_ID = process.env.GUILD_ID;   // recommended for instant slash command updates

if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN missing in .env');
  process.exit(1);
}

// =====================================================
// FETCH COMPATIBILITY
// Works on Node 18+ and older setups with node-fetch fallback
// =====================================================
const fetchFn =
  typeof fetch === 'function'
    ? fetch.bind(globalThis)
    : (...args) =>
        import('node-fetch').then(({ default: fetch }) => fetch(...args));

const JARTEX_API = 'https://stats.jartexnetwork.com/api';

// =====================================================
// HELPER FUNCTIONS
// =====================================================
async function fetchJson(endpoint, retries = 3) {
  const url = `${JARTEX_API}${endpoint}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchFn(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });

      if (!res.ok) {
        if (attempt === retries) return null;
        continue;
      }

      return await res.json();
    } catch (err) {
      console.error(`Fetch failed (${attempt}/${retries}) for ${endpoint}:`, err?.message || err);
      if (attempt === retries) return null;
    }
  }

  return null;
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatNum(value) {
  return toNum(value).toLocaleString('en-IN');
}

function safeText(value, fallback = 'Unknown') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function extractValue(source, keys) {
  if (!source) return 0;

  if (Array.isArray(source)) {
    for (const item of source) {
      const id = item?.id || item?.name || item?.stat;
      if (keys.includes(id)) {
        return toNum(item?.value ?? item?.amount ?? item?.count ?? 0);
      }
    }
    return 0;
  }

  for (const key of keys) {
    const v = source?.[key];
    if (v && typeof v === 'object') {
      return toNum(v.value ?? v.amount ?? v.count ?? 0);
    }
    if (v !== undefined && v !== null) {
      return toNum(v);
    }
  }

  return 0;
}

function extractArray(maybeArrayOrObject) {
  if (Array.isArray(maybeArrayOrObject)) return maybeArrayOrObject;
  if (maybeArrayOrObject?.data && Array.isArray(maybeArrayOrObject.data)) return maybeArrayOrObject.data;
  if (maybeArrayOrObject?.items && Array.isArray(maybeArrayOrObject.items)) return maybeArrayOrObject.items;
  if (maybeArrayOrObject?.results && Array.isArray(maybeArrayOrObject.results)) return maybeArrayOrObject.results;
  return [];
}

function clampText(text, maxLen) {
  const s = String(text ?? '');
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + '...';
}

// =====================================================
// WEB SERVER
// =====================================================
const app = express();
app.get('/', (req, res) => res.send('Jartex Stats Bot is online.'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌍 Web server running on port ${PORT}`));

// =====================================================
// DISCORD BOT
// =====================================================
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const commands = [
  {
    name: 'ping',
    description: 'Check bot latency'
  },
  {
    name: 'stats',
    description: 'Get player stats',
    options: [
      {
        name: 'username',
        description: 'Minecraft username',
        type: ApplicationCommandOptionType.String,
        required: true
      }
    ]
  },
  {
    name: 'clan',
    description: 'Get clan information',
    options: [
      {
        name: 'name',
        description: 'Exact clan name',
        type: ApplicationCommandOptionType.String,
        required: true
      }
    ]
  },
  {
    name: 'recent',
    description: 'View the most recent game of a player',
    options: [
      {
        name: 'username',
        description: 'Minecraft username',
        type: ApplicationCommandOptionType.String,
        required: true
      }
    ]
  },
  {
    name: 'clanlb',
    description: 'Top clans scraped from leaderboard data'
  }
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    if (GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID || client.user.id, GUILD_ID),
        { body: commands }
      );
      console.log('✅ Registered guild slash commands');
    } else {
      await rest.put(
        Routes.applicationCommands(CLIENT_ID || client.user.id),
        { body: commands }
      );
      console.log('✅ Registered global slash commands');
      console.log('ℹ Global commands can take time to appear. Use GUILD_ID for instant testing.');
    }
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
}

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();
});

// =====================================================
// COMMAND HANDLER
// =====================================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    // -------------------------------------------------
    // /ping
    // -------------------------------------------------
    if (interaction.commandName === 'ping') {
      const sent = await interaction.reply({
        content: 'Pinging...',
        fetchReply: true
      });

      const latency = sent.createdTimestamp - interaction.createdTimestamp;
      const apiLatency = interaction.client.ws.ping;

      return interaction.editReply(
        `🏓 Pong! Bot Latency: \`${latency}ms\` | API Latency: \`${apiLatency}ms\``
      );
    }

    // -------------------------------------------------
    // /stats
    // -------------------------------------------------
    if (interaction.commandName === 'stats') {
      const username = interaction.options.getString('username', true);
      await interaction.deferReply();

      const profile = await fetchJson(`/profile/${encodeURIComponent(username)}`);
      if (!profile) {
        return interaction.editReply(`❌ Player \`${username}\` not found.`);
      }

      const bwStats = await fetchJson(
        `/profile/${encodeURIComponent(username)}/leaderboard?type=bedwars&interval=total&mode=ALL_MODES`
      );

      const statsSource = bwStats?.data || bwStats || {};
      const profileName = profile.username || username;

      const embed = new EmbedBuilder()
        .setColor('#00ff99')
        .setTitle(`📊 Stats for ${profileName}`)
        .setThumbnail(`https://mc-heads.net/avatar/${encodeURIComponent(username)}`)
        .addFields(
          { name: '🎖 Rank', value: safeText(profile.rank?.name, 'Default'), inline: true },
          { name: '⭐ Level', value: formatNum(profile.level || 0), inline: true },
          { name: '🛡 Clan', value: safeText(profile.clan?.name, 'None'), inline: true },
          { name: '⚔ Kills', value: formatNum(extractValue(statsSource, ['kills', 'kill'])), inline: true },
          { name: '🏆 Wins', value: formatNum(extractValue(statsSource, ['wins', 'win'])), inline: true },
          { name: '🛏 Beds Destroyed', value: formatNum(extractValue(statsSource, ['beds_destroyed', 'beds'])), inline: true },
          { name: '💀 Deaths', value: formatNum(extractValue(statsSource, ['deaths', 'death'])), inline: true },
          { name: '🎮 Games Played', value: formatNum(extractValue(statsSource, ['played', 'games_played'])), inline: true },
          { name: '💥 Final Kills', value: formatNum(extractValue(statsSource, ['final_kills', 'finalkills'])), inline: true }
        )
        .setFooter({ text: 'JartexNetwork Stats' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // -------------------------------------------------
    // /clan
    // -------------------------------------------------
    if (interaction.commandName === 'clan') {
      const clanName = interaction.options.getString('name', true);
      await interaction.deferReply();

      const clan = await fetchJson(`/clans/${encodeURIComponent(clanName)}`);
      if (!clan) {
        return interaction.editReply(`❌ Clan \`${clanName}\` not found.`);
      }

      const members = extractArray(clan.members);
      const memberNames = members
        .map(m => safeText(m?.username || m?.name || m, null))
        .filter(Boolean);

      let membersList = memberNames.length ? memberNames.join(', ') : 'None';
      membersList = clampText(membersList, 1000);

      const embed = new EmbedBuilder()
        .setColor('#ff0099')
        .setTitle(`🛡 Clan Profile: ${safeText(clan.name, clanName)}`)
        .addFields(
          { name: '👑 Owner', value: safeText(clan.owner?.username || clan.leader?.username, 'Unknown'), inline: true },
          { name: '🏆 Trophies', value: formatNum(clan.trophies || 0), inline: true },
          { name: '⭐ Level', value: formatNum(clan.level || clan.tier || 1), inline: true },
          { name: '✨ Clan EXP', value: formatNum(clan.exp || clan.xp || 0), inline: true },
          { name: '👥 Members', value: formatNum(members.length || clan.members?.length || 0), inline: true },
          { name: '📜 Member List', value: membersList || 'None', inline: false }
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // -------------------------------------------------
    // /recent
    // -------------------------------------------------
    if (interaction.commandName === 'recent') {
      const username = interaction.options.getString('username', true);
      await interaction.deferReply();

      const profile = await fetchJson(`/profile/${encodeURIComponent(username)}`);
      if (!profile) {
        return interaction.editReply(`❌ Player \`${username}\` not found.`);
      }

      const recentGames =
        extractArray(profile.recentGames) ||
        extractArray(profile.matches) ||
        extractArray(profile.games);

      if (!recentGames.length) {
        return interaction.editReply(
          `❌ No recent match data available for **${username}** right now. Jartex may not expose it.`
        );
      }

      const latest = recentGames[0] || {};
      const embed = new EmbedBuilder()
        .setColor('#ffa500')
        .setTitle(`🕒 Most Recent Game for ${safeText(profile.username, username)}`)
        .addFields(
          { name: '🎮 Mode', value: safeText(latest.mode || latest.gameType || latest.type, 'Unknown'), inline: true },
          { name: '🗺️ Map', value: safeText(latest.map, 'Unknown'), inline: true },
          { name: '⚔️ Kills', value: formatNum(latest.kills || 0), inline: true },
          { name: '✅ Result', value: safeText(latest.result || latest.outcome, 'Unknown'), inline: true }
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // -------------------------------------------------
    // /clanlb
    // -------------------------------------------------
    if (interaction.commandName === 'clanlb') {
      await interaction.deferReply();

      const lb = await fetchJson('/leaderboard/bedwars/level');
      const players = extractArray(lb);

      if (!players.length) {
        return interaction.editReply('❌ Could not fetch leaderboard data from Jartex.');
      }

      const clanMap = new Map();

      for (const player of players) {
        const clanName = player?.clan?.name;
        if (!clanName) continue;

        if (!clanMap.has(clanName)) {
          clanMap.set(clanName, {
            name: clanName,
            trophies: toNum(player.clan?.trophies || 0),
            level: toNum(player.clan?.level || 1)
          });
        }
      }

      const top5 = Array.from(clanMap.values())
        .sort((a, b) => b.trophies - a.trophies)
        .slice(0, 5);

      if (!top5.length) {
        return interaction.editReply('❌ No clan data could be extracted from the leaderboard.');
      }

      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

      const desc = top5
        .map((clan, i) => {
          return `**${medals[i]} \`${clan.name}\`**\n↳ 🏆 **${formatNum(clan.trophies)}** Trophies | ⭐ Level ${clan.level}\n`;
        })
        .join('\n');

      const embed = new EmbedBuilder()
        .setColor('#ffd700')
        .setTitle('🏆 Top 5 Scraped Clans')
        .setDescription(desc)
        .setFooter({ text: 'Compiled from Jartex leaderboard data' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  } catch (err) {
    console.error(`❌ Error in ${interaction.commandName}:`, err);

    const msg = '⚠️ Something broke inside the command. Check the console log.';
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(msg).catch(() => {});
    }
    return interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
});

// =====================================================
// CRASH PROTECTION
// =====================================================
process.on('unhandledRejection', (reason) => {
  console.error('🚫 Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('🚫 Uncaught Exception:', err);
});

// =====================================================
// LOGIN
// =====================================================
client.login(TOKEN);
