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

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.log('❌ Missing .env variables');
  process.exit(1);
}

// =====================================================
// FETCH
// =====================================================

const fetchFn =
  typeof fetch === 'function'
    ? fetch.bind(globalThis)
    : (...args) =>
        import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API = 'https://stats.jartexnetwork.com/api';

// =====================================================
// EXPRESS
// =====================================================

const app = express();

app.get('/', (req, res) => {
  res.send('Jartex Stats Ultra Running');
});

app.listen(process.env.PORT || 3000);

// =====================================================
// CLIENT
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
    description: 'Ping the bot'
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

function safe(v, fallback = 'Unknown') {

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
// SAFE FETCH WITH RETRIES
// =====================================================

async function fetchJson(endpoint, retries = 3) {

  for (let i = 0; i < retries; i++) {

    try {

      const controller = new AbortController();

      const timeout = setTimeout(() => {
        controller.abort();
      }, 7000);

      const res = await fetchFn(`${API}${endpoint}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });

      clearTimeout(timeout);

      if (!res.ok) {

        console.log(`❌ ${endpoint} => ${res.status}`);

        continue;
      }

      return await res.json();

    } catch (err) {

      console.log(`❌ Retry ${i + 1} failed for ${endpoint}`);
    }
  }

  return null;
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

    console.log('✅ Commands registered');

  } catch (err) {

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
        `🏓 Pong!\nBot: \`${latency}ms\`\nGateway: \`${client.ws.ping}ms\``
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
        await fetchJson(`/profile/${username}`);

      if (!profile) {

        return interaction.editReply(
          '❌ Player not found or API failed'
        );
      }

      console.log('===== PROFILE =====');
      console.log(JSON.stringify(profile, null, 2));

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
            value: safe(
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
            value: safe(
              profile.clan?.name,
              'None'
            ),
            inline: true
          },

          {
            name: '⚔ Kills',
            value: 'Hidden',
            inline: true
          },

          {
            name: '🏆 Wins',
            value: 'Hidden',
            inline: true
          },

          {
            name: '🛏 Beds',
            value: 'Hidden',
            inline: true
          },

          {
            name: '💀 Deaths',
            value: 'Hidden',
            inline: true
          },

          {
            name: '🎮 Games',
            value: 'Hidden',
            inline: true
          },

          {
            name: '💥 Final Kills',
            value: 'Hidden',
            inline: true
          }
        )

        .setFooter({
          text: 'Jartex API currently hides leaderboard stats'
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
          '❌ Clan not found or API timeout'
        );
      }

      console.log('===== CLAN =====');
      console.log(JSON.stringify(clan, null, 2));

      const members =
        extractArray(clan.members);

      const names =
        members.map(getMemberName);

      const embed = new EmbedBuilder()

        .setColor('#ff0099')

        .setTitle(
          `🛡 Clan Profile: ${safe(clan.name)}`
        )

        .addFields(

          {
            name: '👑 Owner',
            value: safe(
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
              1
            ),
            inline: true
          },

          {
            name: '✨ Clan EXP',
            value: num(
              clan.exp ||
              clan.xp ||
              0
            ),
            inline: true
          },

          {
            name: `👥 Members (${names.length})`,
            value: names.join(', ').slice(0, 1000)
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

      await interaction.reply(
        '⚠️ Jartex leaderboard API is currently broken/unavailable.'
      );
    }

  } catch (err) {

    console.log(err);

    try {

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

    } catch {}
  }
});

// =====================================================
// CRASH PROTECTION
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
