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
  console.log('❌ DISCORD_TOKEN missing');
  process.exit(1);
}

if (!CLIENT_ID) {
  console.log('❌ CLIENT_ID missing');
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

const API = 'https://stats.jartexnetwork.com/api';

// =====================================================
// WEB SERVER
// =====================================================

const app = express();

app.get('/', (req, res) => {
  res.send('Jartex Stats Ultra Running');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🌍 Web server running on ${PORT}`);
});

// =====================================================
// DISCORD
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
    description: 'Check latency'
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
    description: 'Get clan info',
    options: [
      {
        name: 'name',
        description: 'Clan name',
        type: ApplicationCommandOptionType.String,
        required: true
      }
    ]
  },

  {
    name: 'clanlb',
    description: 'Top clans'
  }
];

// =====================================================
// HELPERS
// =====================================================

async function fetchJson(endpoint) {

  try {

    const res = await fetchFn(`${API}${endpoint}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!res.ok) {
      console.log(`❌ ${endpoint} => ${res.status}`);
      return null;
    }

    return await res.json();

  } catch (err) {

    console.log(`❌ Fetch failed for ${endpoint}`);
    console.log(err);

    return null;
  }
}

function safeText(v, fallback = 'Unknown') {

  if (
    v === undefined ||
    v === null ||
    v === ''
  ) {
    return fallback;
  }

  return String(v);
}

function num(v) {

  const n = Number(v);

  return Number.isFinite(n)
    ? n.toLocaleString('en-IN')
    : '0';
}

function extractArray(data) {

  if (Array.isArray(data)) return data;

  if (Array.isArray(data?.data)) return data.data;

  if (Array.isArray(data?.items)) return data.items;

  if (Array.isArray(data?.results)) return data.results;

  return [];
}

function getMemberName(m) {

  if (typeof m === 'string') return m;

  return (
    m?.username ||
    m?.name ||
    m?.player?.username ||
    m?.user?.username ||
    'Unknown'
  );
}

// =====================================================
// AGGRESSIVE STAT FINDER
// =====================================================

function findStat(data, possibleNames) {

  if (!data) return 0;

  // object structure
  for (const key of possibleNames) {

    if (data[key] !== undefined) {

      const val = data[key];

      if (typeof val === 'object') {
        return Number(
          val.value ||
          val.amount ||
          val.count ||
          0
        );
      }

      return Number(val || 0);
    }
  }

  // array structure
  if (Array.isArray(data)) {

    for (const item of data) {

      const id =
        item?.id ||
        item?.name ||
        item?.stat;

      if (possibleNames.includes(id)) {

        return Number(
          item?.value ||
          item?.amount ||
          item?.count ||
          0
        );
      }
    }
  }

  return 0;
}

// =====================================================
// REGISTER COMMANDS
// =====================================================

async function registerCommands() {

  try {

    const rest = new REST({
      version: '10'
    }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(
        CLIENT_ID,
        GUILD_ID
      ),
      {
        body: commands
      }
    );

    console.log('✅ Guild commands registered');

  } catch (err) {

    console.log('❌ Command registration failed');
    console.log(err);
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
// COMMANDS
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

      // PROFILE
      const profile =
        await fetchJson(`/profile/${username}`);

      if (!profile) {

        return interaction.editReply(
          `❌ Player not found`
        );
      }

      // TRY MULTIPLE ENDPOINTS
      let stats = null;

      const endpoints = [

        `/profile/${username}/leaderboard?type=bedwars`,

        `/profile/${username}/leaderboard?type=bedwars&interval=total`,

        `/profile/${username}/leaderboard?type=bedwars&interval=total&mode=ALL_MODES`,

        `/profile/${username}/leaderboard?type=bedwars&mode=ALL_MODES`
      ];

      for (const ep of endpoints) {

        const res = await fetchJson(ep);

        if (res) {
          stats = res;
          console.log(`✅ Working endpoint: ${ep}`);
          break;
        }
      }

      console.log('===== RAW STATS =====');
      console.log(JSON.stringify(stats, null, 2));

      const data =
        stats?.data ||
        stats ||
        {};

      // MASSIVE KEY FALLBACKS
      const kills = findStat(data, [
        'kills',
        'Kills',
        'kill'
      ]);

      const wins = findStat(data, [
        'wins',
        'Wins',
        'win'
      ]);

      const beds = findStat(data, [
        'beds_destroyed',
        'Beds destroyed',
        'beds'
      ]);

      const deaths = findStat(data, [
        'deaths',
        'Deaths'
      ]);

      const games = findStat(data, [
        'played',
        'Games played',
        'games_played'
      ]);

      const finals = findStat(data, [
        'final_kills',
        'Final kills',
        'finalkills'
      ]);

      const embed = new EmbedBuilder()

        .setColor('#00ff99')

        .setTitle(
          `📊 Stats for ${profile.username || username}`
        )

        .setThumbnail(
          `https://mc-heads.net/avatar/${username}`
        )

        .addFields(

          {
            name: '🎖 Rank',
            value: safeText(
              profile.rank?.name ||
              profile.rank?.display,
              'Default'
            ),
            inline: true
          },

          {
            name: '⭐ Level',
            value: num(
              profile.rank?.level ||
              profile.level ||
              0
            ),
            inline: true
          },

          {
            name: '🛡 Clan',
            value: safeText(
              profile.clan?.name,
              'None'
            ),
            inline: true
          },

          {
            name: '⚔ Kills',
            value: num(kills),
            inline: true
          },

          {
            name: '🏆 Wins',
            value: num(wins),
            inline: true
          },

          {
            name: '🛏 Beds',
            value: num(beds),
            inline: true
          },

          {
            name: '💀 Deaths',
            value: num(deaths),
            inline: true
          },

          {
            name: '🎮 Games',
            value: num(games),
            inline: true
          },

          {
            name: '💥 Final Kills',
            value: num(finals),
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
        await fetchJson(`/clans/${clanName}`);

      if (!clan) {

        return interaction.editReply(
          `❌ Clan not found`
        );
      }

      console.log('===== RAW CLAN =====');
      console.log(JSON.stringify(clan, null, 2));

      const members =
        extractArray(clan.members);

      const names =
        members.map(getMemberName);

      const memberList =
        names.join(', ').slice(0, 1000);

      const embed = new EmbedBuilder()

        .setColor('#ff0099')

        .setTitle(
          `🛡 Clan Profile: ${clan.name}`
        )

        .addFields(

          {
            name: '👑 Owner',
            value: safeText(
              clan.owner?.username ||
              clan.leader?.username
            ),
            inline: true
          },

          {
            name: '🏆 Trophies',
            value: num(
              clan.trophies ||
              clan.stats?.trophies ||
              0
            ),
            inline: true
          },

          {
            name: '⭐ Level',
            value: num(
              clan.level ||
              clan.tier ||
              clan.stats?.level ||
              1
            ),
            inline: true
          },

          {
            name: '✨ Clan EXP',
            value: num(
              clan.exp ||
              clan.xp ||
              clan.stats?.xp ||
              0
            ),
            inline: true
          },

          {
            name: `👥 Members (${names.length})`,
            value: memberList || 'None'
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

      // fallback scraper
      const lb =
        await fetchJson('/leaderboard/bedwars/level');

      if (!lb) {

        return interaction.editReply(
          '❌ Could not fetch leaderboard data'
        );
      }

      console.log('===== RAW LB =====');
      console.log(JSON.stringify(lb, null, 2));

      const players =
        extractArray(lb);

      if (!players.length) {

        return interaction.editReply(
          '❌ No leaderboard entries found'
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

            trophies:
              Number(clan.trophies || 0),

            level:
              Number(clan.level || 1)
          });
        }
      }

      const top =
        Array.from(clanMap.values())
          .sort((a, b) =>
            b.trophies - a.trophies
          )
          .slice(0, 5);

      if (!top.length) {

        return interaction.editReply(
          '❌ Could not scrape clan data'
        );
      }

      const medals =
        ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

      const desc =
        top.map((c, i) =>
          `**${medals[i]} \`${c.name}\`**\n🏆 ${num(c.trophies)} | ⭐ ${num(c.level)}`
        ).join('\n\n');

      const embed = new EmbedBuilder()

        .setColor('#ffd700')

        .setTitle(
          '🏆 Top Clans'
        )

        .setDescription(desc)

        .setTimestamp();

      return interaction.editReply({
        embeds: [embed]
      });
    }

  } catch (err) {

    console.log(err);

    if (
      interaction.deferred ||
      interaction.replied
    ) {

      return interaction.editReply(
        '⚠ Internal bot error'
      );
    }

    return interaction.reply({
      content: '⚠ Internal bot error',
      ephemeral: true
    });
  }
});

// =====================================================
// ANTI CRASH
// =====================================================

process.on('unhandledRejection', err => {
  console.log(err);
});

process.on('uncaughtException', err => {
  console.log(err);
});

// =====================================================
// LOGIN
// =====================================================

client.login(TOKEN);
