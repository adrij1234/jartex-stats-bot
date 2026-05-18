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
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN missing in .env');
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error('❌ CLIENT_ID missing in .env');
  process.exit(1);
}

// =====================================================
// FETCH FIX
// =====================================================

const fetchFn =
  typeof fetch === 'function'
    ? fetch.bind(globalThis)
    : (...args) =>
        import('node-fetch').then(({ default: fetch }) => fetch(...args));

const JARTEX_API = 'https://stats.jartexnetwork.com/api';

// =====================================================
// EXPRESS WEB SERVER
// =====================================================

const app = express();

app.get('/', (req, res) => {
  res.send('Jartex Stats Ultra Online');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🌍 Web server running on port ${PORT}`);
});

// =====================================================
// DISCORD CLIENT
// =====================================================

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// =====================================================
// COMMANDS
// =====================================================

const commands = [
  {
    name: 'ping',
    description: 'Check bot latency'
  },

  {
    name: 'stats',
    description: 'Get player Bedwars stats',
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
    description: 'View most recent game',
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
    description: 'Top scraped clans'
  }
];

// =====================================================
// HELPERS
// =====================================================

async function fetchJson(endpoint, retries = 3) {

  const url = `${JARTEX_API}${endpoint}`;

  for (let i = 1; i <= retries; i++) {

    try {

      const res = await fetchFn(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });

      if (!res.ok) {

        console.log(`❌ API returned ${res.status} for ${endpoint}`);

        if (i === retries) return null;

        continue;
      }

      return await res.json();

    } catch (err) {

      console.error(`❌ Fetch failed (${i}/${retries})`, err);

      if (i === retries) return null;
    }
  }

  return null;
}

function toNum(v) {

  const n = Number(v);

  return Number.isFinite(n) ? n : 0;
}

function formatNum(v) {

  return toNum(v).toLocaleString('en-IN');
}

function safeText(v, fallback = 'Unknown') {

  if (v === undefined || v === null || v === '') {
    return fallback;
  }

  return String(v);
}

function extractArray(data) {

  if (Array.isArray(data)) return data;

  if (Array.isArray(data?.data)) return data.data;

  if (Array.isArray(data?.items)) return data.items;

  if (Array.isArray(data?.results)) return data.results;

  return [];
}

function clampText(text, max) {

  text = String(text || '');

  if (text.length <= max) return text;

  return text.slice(0, max - 3) + '...';
}

function getMemberName(m) {

  if (typeof m === 'string') return m;

  if (!m || typeof m !== 'object') return 'Unknown';

  return (
    m.username ||
    m.name ||
    m.player?.username ||
    m.user?.username ||
    m.member?.username ||
    m.nick ||
    'Unknown'
  );
}

function extractValue(source, keys) {

  if (!source) return 0;

  if (Array.isArray(source)) {

    for (const item of source) {

      const id = item?.id || item?.name || item?.stat;

      if (keys.includes(id)) {

        return toNum(
          item?.value ??
          item?.amount ??
          item?.count ??
          0
        );
      }
    }

    return 0;
  }

  for (const key of keys) {

    const v = source?.[key];

    if (v && typeof v === 'object') {

      return toNum(
        v.value ??
        v.amount ??
        v.count ??
        0
      );
    }

    if (v !== undefined && v !== null) {

      return toNum(v);
    }
  }

  return 0;
}

// =====================================================
// REGISTER COMMANDS
// =====================================================

async function registerCommands() {

  try {

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    const route = GUILD_ID
      ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
      : Routes.applicationCommands(CLIENT_ID);

    await rest.put(route, {
      body: commands
    });

    console.log(
      GUILD_ID
        ? '✅ Guild commands registered'
        : '✅ Global commands registered'
    );

  } catch (err) {

    console.error('❌ Command registration failed:', err);
  }
}

// =====================================================
// READY
// =====================================================

client.once('ready', async () => {

  console.log(`✅ Logged in as ${client.user.tag}`);

  await registerCommands();
});

// =====================================================
// INTERACTIONS
// =====================================================

client.on('interactionCreate', async interaction => {

  if (!interaction.isChatInputCommand()) return;

  try {

    // =================================================
    // PING
    // =================================================

    if (interaction.commandName === 'ping') {

      const sent = await interaction.reply({
        content: '🏓 Pinging...',
        fetchReply: true
      });

      const latency =
        sent.createdTimestamp -
        interaction.createdTimestamp;

      return interaction.editReply(
        `🏓 Pong!\nBot: \`${latency}ms\`\nAPI: \`${client.ws.ping}ms\``
      );
    }

    // =================================================
    // STATS
    // =================================================

    if (interaction.commandName === 'stats') {

      const username =
        interaction.options.getString('username');

      await interaction.deferReply();

      const profile =
        await fetchJson(`/profile/${encodeURIComponent(username)}`);

      if (!profile) {

        return interaction.editReply(
          `❌ Player \`${username}\` not found`
        );
      }

      const bwStats =
        await fetchJson(
          `/profile/${encodeURIComponent(username)}/leaderboard?type=bedwars&interval=total&mode=ALL_MODES`
        );

      const stats =
        bwStats?.data || bwStats || {};

      const embed = new EmbedBuilder()

        .setColor('#00ff99')

        .setTitle(
          `📊 Stats for ${profile.username || username}`
        )

        .setThumbnail(
          `https://mc-heads.net/avatar/${encodeURIComponent(username)}`
        )

        .addFields(

          {
            name: '🎖 Rank',
            value: safeText(profile.rank?.name, 'Default'),
            inline: true
          },

          {
            name: '⭐ Level',
            value: formatNum(profile.level || 0),
            inline: true
          },

          {
            name: '🛡 Clan',
            value: safeText(profile.clan?.name, 'None'),
            inline: true
          },

          {
            name: '⚔ Kills',
            value: formatNum(
              extractValue(stats, ['kills'])
            ),
            inline: true
          },

          {
            name: '🏆 Wins',
            value: formatNum(
              extractValue(stats, ['wins'])
            ),
            inline: true
          },

          {
            name: '🛏 Beds',
            value: formatNum(
              extractValue(stats, ['beds_destroyed'])
            ),
            inline: true
          },

          {
            name: '💀 Deaths',
            value: formatNum(
              extractValue(stats, ['deaths'])
            ),
            inline: true
          },

          {
            name: '🎮 Games',
            value: formatNum(
              extractValue(stats, ['played'])
            ),
            inline: true
          },

          {
            name: '💥 Final Kills',
            value: formatNum(
              extractValue(stats, ['final_kills'])
            ),
            inline: true
          }
        )

        .setFooter({
          text: 'Jartex Stats Ultra'
        })

        .setTimestamp();

      return interaction.editReply({
        embeds: [embed]
      });
    }

    // =================================================
    // CLAN
    // =================================================

    if (interaction.commandName === 'clan') {

      const clanName =
        interaction.options.getString('name');

      await interaction.deferReply();

      const clan =
        await fetchJson(`/clans/${encodeURIComponent(clanName)}`);

      if (!clan) {

        return interaction.editReply(
          `❌ Clan \`${clanName}\` not found`
        );
      }

      const members =
        extractArray(clan.members);

      const memberNames =
        members
          .map(getMemberName)
          .filter(Boolean);

      let memberList =
        memberNames.length
          ? memberNames.join(', ')
          : 'None';

      memberList =
        clampText(memberList, 1000);

      const embed = new EmbedBuilder()

        .setColor('#ff0099')

        .setTitle(
          `🛡 Clan Profile: ${safeText(clan.name, clanName)}`
        )

        .addFields(

          {
            name: '👑 Owner',
            value: safeText(
              clan.owner?.username ||
              clan.leader?.username,
              'Unknown'
            ),
            inline: true
          },

          {
            name: '🏆 Trophies',
            value: formatNum(clan.trophies || 0),
            inline: true
          },

          {
            name: '⭐ Level',
            value: formatNum(
              clan.level ||
              clan.tier ||
              1
            ),
            inline: true
          },

          {
            name: '✨ Clan EXP',
            value: formatNum(
              clan.exp ||
              clan.xp ||
              0
            ),
            inline: true
          },

          {
            name: `👥 Members (${memberNames.length})`,
            value: memberList
          }
        )

        .setTimestamp();

      return interaction.editReply({
        embeds: [embed]
      });
    }

    // =================================================
    // RECENT
    // =================================================

    if (interaction.commandName === 'recent') {

      const username =
        interaction.options.getString('username');

      await interaction.deferReply();

      const profile =
        await fetchJson(`/profile/${encodeURIComponent(username)}`);

      if (!profile) {

        return interaction.editReply(
          `❌ Player \`${username}\` not found`
        );
      }

      const recentGames =
        extractArray(profile.recentGames) ||
        extractArray(profile.matches);

      if (!recentGames.length) {

        return interaction.editReply(
          `❌ No recent match data available for **${username}**`
        );
      }

      const latest =
        recentGames[0];

      const embed = new EmbedBuilder()

        .setColor('#ffaa00')

        .setTitle(
          `🕒 Recent Match for ${username}`
        )

        .addFields(

          {
            name: '🎮 Mode',
            value: safeText(
              latest.mode ||
              latest.gameType
            ),
            inline: true
          },

          {
            name: '🗺 Map',
            value: safeText(latest.map),
            inline: true
          },

          {
            name: '⚔ Kills',
            value: formatNum(latest.kills || 0),
            inline: true
          }
        )

        .setTimestamp();

      return interaction.editReply({
        embeds: [embed]
      });
    }

    // =================================================
    // CLANLB
    // =================================================

    if (interaction.commandName === 'clanlb') {

      await interaction.deferReply();

      const lb =
        await fetchJson('/leaderboard/bedwars/level');

      const players =
        extractArray(lb);

      if (!players.length) {

        return interaction.editReply(
          '❌ Could not fetch leaderboard data'
        );
      }

      const clanMap = new Map();

      for (const player of players) {

        const clan =
          player?.clan;

        if (!clan?.name) continue;

        if (!clanMap.has(clan.name)) {

          clanMap.set(clan.name, {

            name: clan.name,

            trophies: toNum(
              clan.trophies || 0
            ),

            level: toNum(
              clan.level || 1
            )
          });
        }
      }

      const top5 =
        Array.from(clanMap.values())
          .sort((a, b) =>
            b.trophies - a.trophies
          )
          .slice(0, 5);

      if (!top5.length) {

        return interaction.editReply(
          '❌ No clans found'
        );
      }

      const medals =
        ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

      const desc =
        top5.map((c, i) =>
          `**${medals[i]} \`${c.name}\`**\n↳ 🏆 ${formatNum(c.trophies)} Trophies | ⭐ Level ${c.level}`
        ).join('\n\n');

      const embed = new EmbedBuilder()

        .setColor('#ffd700')

        .setTitle(
          '🏆 Top 5 Scraped Clans'
        )

        .setDescription(desc)

        .setTimestamp();

      return interaction.editReply({
        embeds: [embed]
      });
    }

  } catch (err) {

    console.error(
      `❌ Error in ${interaction.commandName}:`,
      err
    );

    const msg =
      '⚠️ Internal bot error';

    if (
      interaction.deferred ||
      interaction.replied
    ) {

      return interaction.editReply(msg)
        .catch(() => {});
    }

    return interaction.reply({
      content: msg,
      ephemeral: true
    }).catch(() => {});
  }
});

// =====================================================
// ANTI CRASH
// =====================================================

process.on('unhandledRejection', reason => {
  console.error('🚫 Unhandled Rejection:', reason);
});

process.on('uncaughtException', err => {
  console.error('🚫 Uncaught Exception:', err);
});

// =====================================================
// LOGIN
// =====================================================

client.login(TOKEN);
