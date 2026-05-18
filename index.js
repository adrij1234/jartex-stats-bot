require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const express = require('express');

// =====================================================================
// 1. YOUR SECRET TOKEN VARIABLE
// =====================================================================
// Keeps your password hidden. Render will automatically inject your 
// real token into 'process.env.DISCORD_TOKEN' when the bot boots up.
const mySecretToken = process.env.DISCORD_TOKEN;


// =====================================================================
// 2. THE FAKE WEB SERVER (To keep it awake on Render 24/7)
// =====================================================================
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is alive and running 24/7!');
});

app.listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});


// =====================================================================
// 3. THE DISCORD BOT
// =====================================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, // Required to receive slash command interactions
  ],
});

// Define your slash commands here
const commands = [
  {
    name: 'ping',
    description: 'Replies with a ping to prove we built it from scratch!',
  },
];

// When the bot wakes up
client.once('ready', async () => {
  console.log(`Victory! Logged in as ${client.user.tag}`);

  // Register the slash commands using your secure token variable
  const rest = new REST({ version: '10' }).setToken(mySecretToken);
  
  try {
    console.log('Registering your slash commands with Discord...');
    
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
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong! The slash command is fully operational.');
  }
});


// =====================================================================
// 4. POWER ON
// =====================================================================
// The login function neatly asks your variable for the password
client.login(mySecretToken);
