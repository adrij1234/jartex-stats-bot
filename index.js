require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const express = require('express');

// --- 1. THE FAKE WEB SERVER (For Render 24/7 Hosting) ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is alive and running!');
});

app.listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});

// --- 2. THE ACTUAL DISCORD BOT ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, // This is the only intent needed for slash commands
  ],
});

// Define what your slash command looks like
const commands = [
  {
    name: 'ping',
    description: 'Replies with a ping to prove we built it from scratch!',
  },
];

// When the bot wakes up
client.once('ready', async () => {
  console.log(`Victory! Logged in as ${client.user.tag}`);

  // Register the slash command with Discord's API
  const rest = new REST({ version: '10' }).setToken('MTUwNTQyMjUxNjU0NDM0MDA4OQ.G6tl96.oeIRKhMVAJMjb99TpTeCdLk_nYW1LmkKt64SHM');
  
  try {
    console.log('Registering your slash commands with Discord...');
    
    // We use client.user.id to automatically grab your bot's ID
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log('Slash commands registered successfully!');
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
});

// When someone actually types /ping and hits enter
client.on('interactionCreate', async (interaction) => {
  // If it's not a slash command, ignore it
  if (!interaction.isChatInputCommand()) return;

  // Check if the command they typed was "/ping"
  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong! Slash commands are fully operational.');
  }
});

// Log the bot into Discord using your hidden token
client.login('MTUwNTQyMjUxNjU0NDM0MDA4OQ.G6tl96.oeIRKhMVAJMjb99TpTeCdLk_nYW1LmkKt64SHM');