// index.js - Main entry point for the Telegram Mini App

// Import dependencies
const express = require('express');
const path = require('path');
const { Server } = require('socket.io');
const http = require('http');
const dotenv = require('dotenv');
const TelegramBot = require('node-telegram-bot-api');

// Import the DiceGame class from models
const DiceGame = require('./models/DiceGame');

// Setup environment variables
dotenv.config();

// Add structured logging
const logger = {
  info: (message, data = {}) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, data ? JSON.stringify(data) : '');
  },
  error: (message, error) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error);
  },
  debug: (message, data = {}) => {
    if (process.env.DEBUG) {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, data ? JSON.stringify(data) : '');
    }
  }
};

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Add JSON body parser middleware
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Telegram Bot with webhook
const bot = new TelegramBot(process.env.BOT_TOKEN, { webHook: true });
const webhookPath = `/bot${process.env.BOT_TOKEN}`;
bot.setWebHook(`https://kdice.onrender.com${webhookPath}`); // Set webhook to Render URL

// Handle Telegram updates via POST
app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Helper function to generate a random game ID
function generateGameId() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Player stats storage - global leaderboard
const playerStats = {};

// Track group chat ID for each game
const gameOrigins = {};

// Game state storage - maps gameIds to game instances
const activeGames = {};

// Help command handler
function getHelpText() {
  return `🎲 *KDice Game Commands* 🎲

/start - Start the bot and get help
/creategame - Create a new game in the current chat
/join - Join an existing game in the current chat
/score - View the all-time leaderboard
/rules - Show the game rules

*How to Play*:
1. One player creates a game with /creategame
2. Other players join with /join
3. Take turns making bids or challenging
4. The loser of each round decides whether to continue

*Game Rules*:
- Each player gets 5 dice, 1s are jokers
- Higher bids or challenges decide who wins points
- Use Pi to double stakes, Fold to surrender, or Open to challenge`;
}

// Rules command handler
function getRulesText() {
  return `🎲 *KDice Game Rules* 🎲

*Basic Rules*:
- Each player gets 5 six-sided dice
- The "1" dice are jokers and count as any value
- Players take turns making bids about how many dice of a certain value are in play
- After a bid, the next player must either make a higher bid or challenge

*Bidding Types*:
- *Regular Bid*: "3 fours" means at least 3 dice showing 4 (or 1 as joker)
- *Tsi (-)*: Only counts exact value, not jokers. "3 fours-" means exactly 3 dice showing 4
- *Fly (+)*: After Tsi, you must double the count, but can pick any value

*Raising Stakes*:
- *Pi (×2)*: Double the stakes (up to 3 times: 2×, 4×, 8×)
- *Fold*: Give up after a Pi, lose half the current stakes
- *Open*: Challenge after a Pi, check if the bid is valid

The game continues until players decide to end it, with the loser of each round deciding whether to play another round.`;
}

// Score command handler
function getScoreText(chatId) {
  let scoreText = "🏆 *ALL-TIME LEADERBOARD* 🏆\n\n";
  
  // Get all players who have played in this chat
  const chatPlayers = Object.values(playerStats)
    .filter(player => player.chatIds && player.chatIds.includes(chatId))
    .sort((a, b) => b.points - a.points);
  
  if (chatPlayers.length === 0) {
    return "No games have been played in this chat yet!";
  }
  
  chatPlayers.forEach((player, index) => {
    const winRate = player.rounds > 0 ? (player.points / player.rounds).toFixed(2) : '0.00';
    const pointsDisplay = player.points >= 0 ? `+${player.points}` : player.points;
    const dollarsDisplay = player.dollars >= 0 ? `+$${player.dollars}` : `-$${Math.abs(player.dollars)}`;
    
    scoreText += `${index + 1}. *${player.name}*: ${pointsDisplay} pts (${player.wins}W/${player.losses}L) ${dollarsDisplay}\n`;
    scoreText += `   Rounds: ${player.rounds} | Win Rate: ${winRate} pts/round\n\n`;
  });
  
  return scoreText;
}

// Log all messages and handle commands
bot.on('message', (msg) => {
  logger.info('Received message', { 
    msgText: msg.text, 
    chatType: msg.chat.type,
    chatId: msg.chat.id,
    from: msg.from.username || msg.from.first_name
  });
  
  // Check if bot was mentioned
  const botMention = `@${bot.getMe().then(botInfo => botInfo.username).catch(() => 'KdiceBot')}`;
  
  if (msg.text && msg.text.includes(botMention)) {
    bot.sendMessage(msg.chat.id, getHelpText(), { parse_mode: 'Markdown' });
    return;
  }
  
  // Handle start command
  if (msg.text && (msg.text === '/start' || msg.text.startsWith('/start@'))) {
    const chatId = msg.chat.id;
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
    
    if (isGroup) {
      bot.sendMessage(chatId, getHelpText(), { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(chatId, "Welcome to Kdice! Click below to play:", {
        reply_markup: {
          inline_keyboard: [[
            { text: "Play Kdice", web_app: { url: "https://kdice.onrender.com" } }
          ]]
        }
      });
    }
  }
  
  // Handle rules command
  else if (msg.text && (msg.text === '/rules' || msg.text.startsWith('/rules@'))) {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, getRulesText(), { parse_mode: 'Markdown' });
  }
  
  // Handle score command
  else if (msg.text && (msg.text === '/score' || msg.text.startsWith('/score@'))) {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, getScoreText(chatId), { parse_mode: 'Markdown' });
  }
  
  // Handle create game command for groups with stake options in text format
  else if (msg.text && (msg.text === '/creategame' || msg.text.startsWith('/creategame@'))) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.first_name || 'Player';
    
    // Offer stake options via text message
    bot.sendMessage(chatId, 
      `${userName} wants to create a new game!\nChoose your stake:`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Free ($0)", callback_data: `create_game_0_${userId}_${encodeURIComponent(userName)}` },
            { text: "Low ($100)", callback_data: `create_game_100_${userId}_${encodeURIComponent(userName)}` }
          ],
          [
            { text: "Medium ($500)", callback_data: `create_game_500_${userId}_${encodeURIComponent(userName)}` },
            { text: "High ($1000)", callback_data: `create_game_1000_${userId}_${encodeURIComponent(userName)}` }
          ],
          [
            { text: "VIP ($10000)", callback_data: `create_game_10000_${userId}_${encodeURIComponent(userName)}` }
          ]
        ]
      }
    });
  }
  
  // Handle join game command for groups
  else if (msg.text && (msg.text === '/join' || msg.text.startsWith('/join@'))) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.first_name || 'Player';
    
    // Find active games from this group chat
    const activeGroupGames = Object.entries(activeGames)
      .filter(([_, game]) => game.originChatId === chatId && !game.gameStarted && !game.gameEnded)
      .map(([id, game]) => ({
        id,
        creator: game.players[0]?.name || 'Unknown',
        stakeValue: game.baseStakeValue
      }));
    
    if (activeGroupGames.length === 0) {
      bot.sendMessage(chatId, "No active games in this chat. Create one with /creategame first!");
      return;
    }
    
    // Check if the user is already in a game
    const alreadyInGame = activeGroupGames.some(game => 
      activeGames[game.id].players.some(p => p.id === `tg_${userId}`)
    );
    
    if (alreadyInGame) {
      // If already in a game, just provide the link to open it
      const gameId = activeGroupGames.find(game => 
        activeGames[game.id].players.some(p => p.id === `tg_${userId}`)
      ).id;
      
      bot.sendMessage(chatId, `${userName}, you're already in a game. Click below to open it:`, {
        reply_markup: {
          inline_keyboard: [[
            { text: "Open Game", web_app: { url: `https://kdice.onrender.com/?join=${gameId}` } }
          ]]
        }
      });
      return;
    }
    
    // Create keyboard with available games
    const keyboard = activeGroupGames.map(game => [{
      text: `Join ${game.creator}'s game ($${game.stakeValue}/point)`,
      callback_data: `join_game_${game.id}_${userId}_${encodeURIComponent(userName)}`
    }]);
    
    bot.sendMessage(chatId, "Choose a game to join:", {
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
  }
});

// Handle callback queries for game creation and joining
bot.on('callback_query', (callbackQuery) => {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message.chat.id;
  
  // Handle game creation with stake selection
  if (data.startsWith('create_game_')) {
    const parts = data.split('_');
    const stakeValue = parseInt(parts[2]);
    const creatorId = parts[3];
    const creatorName = decodeURIComponent(parts[4]);
    
    // Generate a new game ID
    const gameId = generateGameId();
    
    // Create a new game with the selected stake
    const game = new DiceGame(gameId);
    game.originChatId = chatId;
    game.baseStakeValue = stakeValue;
    game.addPlayer(`tg_${creatorId}`, creatorName);
    
    // Store the game
    activeGames[gameId] = game;
    gameOrigins[gameId] = chatId;
    
    // Answer the callback query
    bot.answerCallbackQuery(callbackQuery.id, { text: `Game created with $${stakeValue} stake!` });
    
    // Announce the game creation with join instructions
    bot.sendMessage(chatId, 
      `${creatorName} created a new game with $${stakeValue}/point stake!\n\nGame ID: ${gameId}\n\nOther players type /join to join this game.`);
      
    // Send a private message to the creator with the direct link
    bot.sendMessage(creatorId, `You created a game with $${stakeValue}/point stake. Click below to open it:`, {
      reply_markup: {
        inline_keyboard: [[
          { text: "Open Your Game", web_app: { url: `https://kdice.onrender.com/?join=${gameId}` } }
        ]]
      }
    }).catch(err => logger.error('Failed to send private message to creator', err));
  }
  
  // Handle game joining
  else if (data.startsWith('join_game_')) {
    const parts = data.split('_');
    const gameId = parts[2];
    const joinerId = parts[3];
    const joinerName = decodeURIComponent(parts[4]);
    
    const game = activeGames[gameId];
    
    if (!game) {
      bot.answerCallbackQuery(callbackQuery.id, { text: "Game not found or already ended!" });
      return;
    }
    
    if (game.gameStarted) {
      bot.answerCallbackQuery(callbackQuery.id, { text: "Game already started!" });
      return;
    }
    
    // Add the player to the game
    if (game.addPlayer(`tg_${joinerId}`, joinerName)) {
      bot.answerCallbackQuery(callbackQuery.id, { text: "Joined the game successfully!" });
      
      // Announce the player joining
      bot.sendMessage(chatId, 
        `${joinerName} joined ${game.players[0].name}'s game! The game can now begin.`);
      
      // Send a private message to the joiner with the direct link
      bot.sendMessage(joinerId, `You joined ${game.players[0].name}'s game. Click below to open it:`, {
        reply_markup: {
          inline_keyboard: [[
            { text: "Open Game", web_app: { url: `https://kdice.onrender.com/?join=${gameId}` } }
          ]]
        }
      }).catch(err => logger.error('Failed to send private message to joiner', err));
      
      // Notify all connected clients about the new player
      io.to(gameId).emit('playerJoined', {
        player: { id: `tg_${joinerId}`, name: joinerName },
        state: game.getGameState()
      });
    } else {
      bot.answerCallbackQuery(callbackQuery.id, { text: "Failed to join game!" });
    }
  }
});

// Function to update player stats
function updatePlayerStats(winner, loser, stakes, gameId) {
  // Initialize player stats if needed
  if (!playerStats[winner.id]) {
    playerStats[winner.id] = { 
      name: winner.name, 
      wins: 0, 
      losses: 0,
      points: 0,
      rounds: 0,
      dollars: 0,
      chatIds: []
    };
  }
  if (!playerStats[loser.id]) {
    playerStats[loser.id] = { 
      name: loser.name, 
      wins: 0, 
      losses: 0,
      points: 0,
      rounds: 0,
      dollars: 0,
      chatIds: []
    };
  }
  
  // Track chat ID for leaderboard filtering
  const chatId = gameOrigins[gameId];
  if (chatId) {
    if (!playerStats[winner.id].chatIds) playerStats[winner.id].chatIds = [];
    if (!playerStats[loser.id].chatIds) playerStats[loser.id].chatIds = [];
    
    if (!playerStats[winner.id].chatIds.includes(chatId)) {
      playerStats[winner.id].chatIds.push(chatId);
    }
    if (!playerStats[loser.id].chatIds.includes(chatId)) {
      playerStats[loser.id].chatIds.push(chatId);
    }
  }
  
  // Update stats
  playerStats[winner.id].wins += 1;
  playerStats[winner.id].points += stakes;
  playerStats[winner.id].rounds += 1;
  playerStats[winner.id].dollars += stakes * (activeGames[gameId]?.baseStakeValue || 100);
  
  playerStats[loser.id].losses += 1;
  playerStats[loser.id].points -= stakes;
  playerStats[loser.id].rounds += 1;
  playerStats[loser.id].dollars -= stakes * (activeGames[gameId]?.baseStakeValue || 100);
  
  logger.info(`Stats updated`, {
    winner: winner.name,
    loser: loser.name,
    stakes: stakes,
    winnerNewPoints: playerStats[winner.id].points,
    loserNewPoints: playerStats[loser.id].points
  });
  
  // If game came from a group chat, announce the result
  const game = activeGames[gameId];
  
  if (game && game.originChatId) {
    bot.sendMessage(game.originChatId, 
      `Game update: ${winner.name} won ${stakes} points ($${stakes * game.baseStakeValue}) from ${loser.name}!`
    );
  }
}

// Function to post leaderboard to original group chat
function postLeaderboard(gameId) {
  // Check if we have origin info for this game
  const chatId = gameOrigins[gameId];
  const game = activeGames[gameId];
  
  if (!chatId || !game) return;
  
  // Create a sorted leaderboard of just the players in this game
  const gamePlayerIds = game.players.map(p => p.id);
  const gameLeaderboard = gamePlayerIds
    .map(id => {
      const stats = playerStats[id] || {
        name: game.players.find(p => p.id === id)?.name || 'Unknown',
        points: game.playerScores[id] || 0,
        rounds: game.roundHistory.length || 0,
        dollars: (game.playerScores[id] || 0) * game.baseStakeValue,
        wins: 0,
        losses: 0
      };
      
      // Count wins and losses from game history if they're not tracked
      if (!stats.wins || !stats.losses) {
        stats.wins = game.roundHistory.filter(r => r.winner === id).length;
        stats.losses = game.roundHistory.filter(r => r.loser === id).length;
      }
      
      return stats;
    })
    .sort((a, b) => b.points - a.points);
  
  // Generate leaderboard text
  let leaderboardText = "🏆 *GAME RESULTS* 🏆\n\n";
  
  if (gameLeaderboard.length > 0) {
    gameLeaderboard.forEach((player, index) => {
      const pointsPerRound = player.rounds > 0 ? (player.points / player.rounds).toFixed(1) : '0.0';
      const dollarText = player.dollars >= 0 ? `+$${player.dollars}` : `-$${Math.abs(player.dollars)}`;
      const pointsText = player.points >= 0 ? `+${player.points}` : `${player.points}`;
      
      leaderboardText += `${index + 1}. *${player.name}*: ${pointsText} points (${pointsPerRound} pts/round) ${dollarText}\n`;
      leaderboardText += `   Rounds Played: ${player.rounds} | Win/Loss: ${player.wins}W/${player.losses}L\n\n`;
    });
  } else {
    leaderboardText += "No player statistics available yet.";
  }
  
  // Add a global stats section
  leaderboardText += "\n\n*Global Leaderboard:*\nUse /score to see the all-time leaderboard!";
  
  // Send the leaderboard to the chat
  bot.sendMessage(chatId, leaderboardText, {
    parse_mode: 'Markdown'
  });
  
  // Clean up game data
  delete activeGames[gameId];
  delete gameOrigins[gameId];
}

// Set up Socket.IO for real-time communication
io.on('connection', (socket) => {
  logger.info('New socket connection', { socketId: socket.id });
  
  // Handle creating a new game
  socket.on('createGame', ({ playerName, playerId, stakeValue }) => {
    // Ensure valid player data
    if (!playerName || !playerId) {
      socket.emit('error', { message: 'Missing player information' });
      return;
    }
    
    // Create a game ID
    const gameId = generateGameId();
    
    // Create a new game instance
    const game = new DiceGame(gameId);
    game.baseStakeValue = stakeValue || 100;
    
    // Add the player to the game
    game.addPlayer(playerId, playerName);
    
    // Store the game
    activeGames[gameId] = game;
    
    // Subscribe the socket to the game room
    socket.join(gameId);
    
    logger.info('Game created', { gameId, playerName, playerId });
    
    // Send response to the client
    socket.emit('gameCreated', {
      gameId,
      state: game.getGameState(playerId)
    });
  });
  
  // Handle joining an existing game
  socket.on('joinGame', ({ gameId, playerName, playerId }) => {
    // Check if the game exists
    if (!activeGames[gameId]) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Get the game instance
    const game = activeGames[gameId];
    
    // Check if the game has already started
    if (game.gameStarted) {
      socket.emit('error', { message: 'Game has already started' });
      return;
    }
    
    // Normalize player ID
    const normalizedPlayerId = playerId.startsWith('tg_') ? playerId : `tg_${playerId}`;
    
    // Check if the player is already in the game
    const alreadyJoined = game.players.some(player => player.id === normalizedPlayerId);
    
    // Add the player to the game if not already joined
    if (!alreadyJoined) {
      if (!game.addPlayer(normalizedPlayerId, playerName)) {
        socket.emit('error', { message: 'Failed to join game' });
        return;
      }
    }
    
    // Subscribe the socket to the game room
    socket.join(gameId);
    
    logger.info('Player joined game', { gameId, playerName, playerId, alreadyJoined });
    
    // Send response to the client
    socket.emit('gameJoined', {
      gameId,
      state: game.getGameState(normalizedPlayerId),
      alreadyJoined
    });
    
    // Notify other players if this is a new player
    if (!alreadyJoined) {
      socket.to(gameId).emit('playerJoined', {
        player: { id: normalizedPlayerId, name: playerName },
        state: game.getGameState()
      });
    }
  });
  
  // Handle starting the game
  socket.on('startGame', ({ gameId, playerId }) => {
    // Check if the game exists
    if (!activeGames[gameId]) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Get the game instance
    const game = activeGames[gameId];
    
    // Check if the requester is the game creator
    if (game.players.length > 0 && game.players[0].id !== playerId) {
      socket.emit('error', { message: 'Only the creator can start the game' });
      return;
    }
    
    // Check if there are enough players
    if (game.players.length < 2) {
      socket.emit('error', { message: 'Need at least 2 players to start' });
      return;
    }
    
    // Start the game
    if (!game.startGame()) {
      socket.emit('error', { message: 'Failed to start the game' });
      return;
    }
    
    logger.info('Game started', { gameId, startedBy: playerId });
    
    // Notify all players
    for (const player of game.players) {
      io.to(gameId).emit('gameStarted', {
        state: game.getGameState(player.id),
        playerId: player.id
      });
    }
    
    // Tell the first player it's their turn
    const currentPlayer = game.getCurrentPlayer();
    io.to(gameId).emit('yourTurn', {
      state: game.getGameState(currentPlayer.id),
      playerId: currentPlayer.id
    });
  });
  
  // Handle player placing a bid
  socket.on('placeBid', ({ gameId, playerId, count, value, isTsi, isFly }) => {
    // Check if the game exists
    if (!activeGames[gameId]) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Get the game instance
    const game = activeGames[gameId];
    
    // Place the bid
    const result = game.placeBid(playerId, count, value, isTsi, isFly);
    
    if (!result.success) {
      socket.emit('error', { message: result.message });
      return;
    }
    
    logger.info('Bid placed', { gameId, playerId, count, value, isTsi, isFly });
    
    // Get the player who made the bid
    const bidder = game.players.find(p => p.id === playerId);
    
    // Notify all players about the bid
    io.to(gameId).emit('bidPlaced', {
      player: bidder,
      bid: { count, value, isTsi, isFly },
      state: game.getGameState(),
      nextPlayerId: game.getCurrentPlayer().id
    });
    
    // Tell the next player it's their turn
    const currentPlayer = game.getCurrentPlayer();
    io.to(gameId).emit('yourTurn', {
      state: game.getGameState(currentPlayer.id),
      playerId: currentPlayer.id
    });
  });
  
  // Handle player challenging a bid
  socket.on('challenge', ({ gameId, playerId }) => {
    // Check if the game exists
    if (!activeGames[gameId]) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Get the game instance
    const game = activeGames[gameId];
    
    // Challenge the bid
    const result = game.challenge(playerId);
    
    if (!result.success) {
      socket.emit('error', { message: result.message });
      return;
    }
    
    logger.info('Bid challenged', { 
      gameId, 
      challengerId: playerId, 
      winner: result.winner.name,
      loser: result.loser.name,
      stakes: game.stakes
    });
    
    // Update player stats
    updatePlayerStats(result.winner, result.loser, game.stakes, gameId);
    
    // Notify all players about the challenge result
    io.to(gameId).emit('challengeResult', {
      challenger: game.players.find(p => p.id === playerId),
      result: result,
      allDice: result.dices,
      baseStakeValue: game.baseStakeValue,
      stakes: game.stakes
    });
  });
  
  // Handle player calling Pi (double stakes)
  socket.on('pi', ({ gameId, playerId }) => {
    // Check if the game exists
    if (!activeGames[gameId]) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Get the game instance
    const game = activeGames[gameId];
    
    // Call Pi
    const result = game.pi(playerId);
    
    if (!result.success) {
      socket.emit('error', { message: result.message });
      return;
    }
    
    logger.info('Pi called', { 
      gameId, 
      playerId, 
      newStakes: result.newStakes,
      piCount: result.piCount
    });
    
    // Notify all players about the Pi call
    io.to(gameId).emit('piCalled', {
      player: result.player,
      newStakes: result.newStakes,
      piCount: result.piCount,
      state: game.getGameState()
    });
    
    // Tell the next player it's their turn
    const currentPlayer = game.getCurrentPlayer();
    io.to(gameId).emit('yourTurn', {
      state: game.getGameState(currentPlayer.id),
      playerId: currentPlayer.id
    });
  });
  
  // Handle player folding
  socket.on('fold', ({ gameId, playerId }) => {
    // Check if the game exists
    if (!activeGames[gameId]) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Get the game instance
    const game = activeGames[gameId];
    
    // Fold
    const result = game.fold(playerId);
    
    if (!result.success) {
      socket.emit('error', { message: result.message });
      return;
    }
    
    logger.info('Player folded', { 
      gameId, 
      folderId: playerId, 
      winnerId: result.winner.id,
      penalty: result.penalty
    });
    
    // Update player stats
    updatePlayerStats(result.winner, result.loser, result.penalty, gameId);
    
    // Notify all players about the fold
    io.to(gameId).emit('foldResult', {
      loser: result.loser,
      winner: result.winner,
      penalty: result.penalty,
      state: game.getGameState(),
      baseStakeValue: game.baseStakeValue
    });
  });
  
  // Handle player calling Open
  socket.on('open', ({ gameId, playerId }) => {
    // Check if the game exists
    if (!activeGames[gameId]) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Get the game instance
    const game = activeGames[gameId];
    
    // Open (same as challenge but with different stakes)
    const result = game.open(playerId);
    
    if (!result.success) {
      socket.emit('error', { message: result.message });
      return;
    }
    
    logger.info('Open called', { 
      gameId, 
      openerId: playerId, 
      winner: result.winner.name,
      loser: result.loser.name,
      stakes: game.stakes
    });
    
    // Update player stats
    updatePlayerStats(result.winner, result.loser, game.stakes, gameId);
    
    // Notify all players about the challenge result
    io.to(gameId).emit('challengeResult', {
      challenger: game.players.find(p => p.id === playerId),
      result: result,
      allDice: result.dices,
      baseStakeValue: game.baseStakeValue,
      stakes: game.stakes
    });
  });
  
  // Handle starting the next round
  socket.on('startNextRound', ({ gameId }) => {
    // Check if the game exists
    if (!activeGames[gameId]) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Get the game instance
    const game = activeGames[gameId];
    
    // Start the next round
    if (!game.startNextRound()) {
      socket.emit('error', { message: 'Failed to start next round' });
      return;
    }
    
    logger.info('Next round started', { gameId, round: game.round });
    
    // Notify all players
    for (const player of game.players) {
      io.to(gameId).emit('roundStarted', {
        state: game.getGameState(player.id),
        playerId: player.id,
        round: game.round
      });
    }
    
    // Tell the first player it's their turn
    const currentPlayer = game.getCurrentPlayer();
    io.to(gameId).emit('yourTurn', {
      state: game.getGameState(currentPlayer.id),
      playerId: currentPlayer.id
    });
  });
  
  // Handle ending the game
  socket.on('endGame', ({ gameId }) => {
    // Check if the game exists
    if (!activeGames[gameId]) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Get the game instance
    const game = activeGames[gameId];
    
    // End the game
    const result = game.endGame();
    
    if (!result.success) {
      socket.emit('error', { message: 'Failed to end game' });
      return;
    }
    
    logger.info('Game ended', { gameId });
    
    // Notify all players
    io.to(gameId).emit('gameEnded', {
      state: game.getGameState(),
      leaderboard: result.leaderboard
    });
    
    // Post leaderboard to group chat if from there
    if (game.originChatId) {
      postLeaderboard(gameId);
    }
  });
  
  // Handle player leaving a game
  socket.on('leaveGame', ({ gameId, playerId }) => {
    // Check if the game exists
    if (!activeGames[gameId]) {
      return; // Silently ignore if game doesn't exist
    }
    
    // Get the game instance
    const game = activeGames[gameId];
    
    // Remove the player
    if (game.removePlayer(playerId)) {
      logger.info('Player left game', { gameId, playerId });
      
      // If the game hasn't started and has no players left, clean it up
      if (!game.gameStarted && game.players.length === 0) {
        delete activeGames[gameId];
        logger.info('Game removed', { gameId });
        return;
      }
      
      // Notify other players
      socket.to(gameId).emit('playerLeft', {
        playerId,
        state: game.getGameState()
      });
    }
  });
  
  // Handle socket disconnect
  socket.on('disconnect', () => {
    logger.info('Socket disconnected', { socketId: socket.id });
  });
});

// Default route for the web app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});