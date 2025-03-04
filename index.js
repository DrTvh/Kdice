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

// Initialize Telegram Bot with webhook
const bot = new TelegramBot(process.env.BOT_TOKEN, { webHook: true });
const webhookPath = `/bot${process.env.BOT_TOKEN}`;
bot.setWebHook(`https://kdice.onrender.com${webhookPath}`); // Set webhook to Render URL

// Handle Telegram updates via POST
app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Player stats storage - global leaderboard
const playerStats = {};

// Track group chat ID for each game
const gameOrigins = {};

// Game state storage - maps gameIds to game instances
const activeGames = {};

// Log all messages to debug group chat issues
bot.on('message', (msg) => {
  logger.info('Received message', { 
    msgText: msg.text, 
    chatType: msg.chat.type,
    chatId: msg.chat.id,
    from: msg.from.username || msg.from.first_name
  });
  
  // Handle start command more directly
  if (msg.text && (msg.text === '/start' || msg.text.startsWith('/start@'))) {
    const chatId = msg.chat.id;
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
    
    if (isGroup) {
      bot.sendMessage(chatId, "Welcome to Kdice! Create a game with /creategame");
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
  
  // Handle create game command for groups
  if (msg.text && (msg.text === '/creategame' || msg.text.startsWith('/creategame@'))) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.first_name || 'Player';
    const gameId = generateGameId();
    
    // Create game with default stake
    const game = new DiceGame(gameId);
    game.originChatId = chatId;
    game.baseStakeValue = 100; // Default stake ($100)
    game.addPlayer(userId.toString(), userName);
    
    // Store the game
    activeGames[gameId] = game;
    
    // Also track this game's origin for leaderboard
    gameOrigins[gameId] = chatId;
    
    const appUrl = `https://kdice.onrender.com/?join=${gameId}`;
    
    // Announce the game in the chat with direct join link
    bot.sendMessage(chatId, 
      `${userName} created a new game!\nGame ID: ${gameId}\nWaiting for players to join...`, {
      reply_markup: {
        inline_keyboard: [[
          { text: "👉 Join this game", url: appUrl }
        ]]
      }
    });
  }
});

// Function to update player stats
function updatePlayerStats(winner, loser, stakes) {
  // Initialize player stats if needed
  if (!playerStats[winner.id]) {
    playerStats[winner.id] = { 
      name: winner.name, 
      wins: 0, 
      losses: 0,
      points: 0,
      rounds: 0,
      dollars: 0
    };
  }
  if (!playerStats[loser.id]) {
    playerStats[loser.id] = { 
      name: loser.name, 
      wins: 0, 
      losses: 0,
      points: 0,
      rounds: 0,
      dollars: 0
    };
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
  const game = Object.values(activeGames).find(g => 
    g.players.some(p => p.id === winner.id) && 
    g.players.some(p => p.id === loser.id)
  );
  
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
    .map(id => playerStats[id])
    .filter(Boolean)
    .sort((a, b) => b.points - a.points);
  
  // Generate leaderboard text
  let leaderboardText = "🏆 *GAME LEADERBOARD* 🏆\n\n";
  
  if (gameLeaderboard.length > 0) {
    gameLeaderboard.forEach((player, index) => {
      const pointsPerRound = player.rounds > 0 ? (player.points / player.rounds).toFixed(1) : '0.0';
      const dollarText = player.dollars >= 0 ? `+$${player.dollars}` : `-$${Math.abs(player.dollars)}`;
      
      leaderboardText += `${index + 1}. *${player.name}*: ${player.points} points (${pointsPerRound} pts/round) ${dollarText}\n`;
    });
  } else {
    leaderboardText += "No player statistics available yet.";
  }
  
  // Add a global stats section
  leaderboardText += "\n\n*Global Leaderboard:*\n";
  const globalLeaderboard = Object.values(playerStats)
    .sort((a, b) => b.points - a.points)
    .slice(0, 5);
  
  globalLeaderboard.forEach((player, index) => {
    const pointsPerRound = player.rounds > 0 ? (player.points / player.rounds).toFixed(1) : '0.0';
    leaderboardText += `${index + 1}. ${player.name}: ${player.points} pts (${pointsPerRound} pts/round)\n`;
  });
  
  // Send to the group
  bot.sendMessage(chatId, leaderboardText, { parse_mode: 'Markdown' });
}

// Add endpoint to get leaderboard
app.get('/api/leaderboard', (req, res) => {
  // Convert playerStats object to array and sort by points
  const leaderboard = Object.values(playerStats)
    .sort((a, b) => b.points - a.points)
    .slice(0, 10); // Get top 10
  
  res.json(leaderboard);
});

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info('User connected', { socketId: socket.id });
  
  // Create a new game
  socket.on('createGame', ({ playerName, playerId, stakeValue = 100 }) => {
    const gameId = generateGameId();
    const game = new DiceGame(gameId);
    
    // Set the stake value
    game.baseStakeValue = stakeValue;
    
    // Add the creator as first player
    game.addPlayer(playerId, playerName);
    
    // Store the game
    activeGames[gameId] = game;
    
    // Join the socket to the game room
    socket.join(gameId);
    
    // Send back the game ID and initial state
    socket.emit('gameCreated', { 
      gameId, 
      state: game.getGameState(playerId) 
    });
    
    logger.info(`Game created`, { gameId, playerName, playerId, stakeValue });
  });
  
  // Join an existing game
  socket.on('joinGame', ({ gameId, playerName, playerId }) => {
    const game = activeGames[gameId];
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      logger.error(`Join failed - game not found`, { gameId, playerId });
      return;
    }
    
    if (game.gameStarted) {
      socket.emit('error', { message: 'Game already started' });
      logger.error(`Join failed - game already started`, { gameId, playerId });
      return;
    }
    
    if (game.addPlayer(playerId, playerName)) {
      // Join the socket to the game room
      socket.join(gameId);
      
      // Notify all players about the new player
      io.to(gameId).emit('playerJoined', { 
        player: { id: playerId, name: playerName },
        state: game.getGameState()
      });
      
      // Send the new player their complete state
      socket.emit('gameJoined', { 
        gameId,
        state: game.getGameState(playerId) 
      });
      
      logger.info(`Player joined game`, { gameId, playerName, playerId });
      
      // If this game was created from a group chat, announce the join
      if (game.originChatId) {
        const creatorName = game.players[0].name;
        bot.sendMessage(game.originChatId, 
          `${playerName} joined ${creatorName}'s game! The game can now begin.`
        );
      }
    } else {
      socket.emit('error', { message: 'Failed to join game' });
      logger.error(`Join failed - could not add player`, { gameId, playerId });
    }
  });
  
  // Start the game
  socket.on('startGame', ({ gameId, playerId }) => {
    const game = activeGames[gameId];
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      logger.error(`Start game failed - game not found`, { gameId, playerId });
      return;
    }
    
    if (game.gameStarted) {
      socket.emit('error', { message: 'Game already started' });
      logger.error(`Start game failed - already started`, { gameId, playerId });
      return;
    }
    
    if (game.startGame()) {
      // Send updated game state to all players
      for (const player of game.players) {
        // Send personalized state to each player with their dice
        io.to(gameId).emit('gameStarted', { 
          state: game.getGameState(player.id),
          playerId: player.id
        });
      }
      
      // Broadcast general game state
      io.to(gameId).emit('gameUpdate', { state: game.getGameState() });
      
      logger.info(`Game started`, { 
        gameId, 
        playerCount: game.players.length,
        players: game.players.map(p => p.name)
      });
      
      // If this game was created from a group chat, announce game start
      if (game.originChatId && game.players.length >= 2) {
        const playerNames = game.players.map(p => p.name).join(" and ");
        bot.sendMessage(game.originChatId, 
          `Game started between ${playerNames}!`
        );
      }
    } else {
      socket.emit('error', { message: 'Cannot start game, need at least 2 players' });
      logger.error(`Start game failed - not enough players`, { gameId, playerId });
    }
  });
  
  // Place a bid
  socket.on('placeBid', ({ gameId, playerId, count, value, isTsi, isFly }) => {
    const game = activeGames[gameId];
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      logger.error(`Bid failed - game not found`, { gameId, playerId });
      return;
    }
    
    if (!game.gameStarted) {
      socket.emit('error', { message: 'Game not started yet' });
      logger.error(`Bid failed - game not started`, { gameId, playerId });
      return;
    }
    
    const result = game.placeBid(playerId, count, value, isTsi, isFly);
    
    if (result.success) {
      // Get the next player who will take their turn
      const nextPlayer = game.getCurrentPlayer();
      
      // Send updated game state to all players
      io.to(gameId).emit('bidPlaced', { 
        player: game.players.find(p => p.id === playerId),
        bid: { count, value, isTsi, isFly },
        state: game.getGameState(),
        nextPlayerId: nextPlayer.id
      });
      
      // Send the next player their dice
      io.to(gameId).emit('yourTurn', {
        state: game.getGameState(nextPlayer.id),
        playerId: nextPlayer.id
      });
      
      logger.info(`Bid placed`, {
        gameId,
        playerId,
        count,
        value,
        isTsi,
        isFly,
        nextPlayerId: nextPlayer.id
      });
    } else {
      socket.emit('error', { message: result.message });
      logger.error(`Bid failed - ${result.message}`, { gameId, playerId });
    }
  });
  
  // Challenge a bid
  socket.on('challenge', ({ gameId, playerId }) => {
    const game = activeGames[gameId];
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      logger.error(`Challenge failed - game not found`, { gameId, playerId });
      return;
    }
    
    if (!game.gameStarted) {
      socket.emit('error', { message: 'Game not started yet' });
      logger.error(`Challenge failed - game not started`, { gameId, playerId });
      return;
    }
    
    const result = game.challenge(playerId);
    
    if (result.success) {
      // Update player scores in game
      game.updatePlayerScore(result.winner.id, result.loser.id, game.stakes);
      
      // Update player stats globally
      updatePlayerStats(result.winner, result.loser, game.stakes);
      
      // Send challenge results to all players
      io.to(gameId).emit('challengeResult', { 
        challenger: game.players.find(p => p.id === playerId),
        result: result,
        allDice: game.dices,
        baseStakeValue: game.baseStakeValue,
        stakes: game.stakes
      });
      
      // Don't automatically start next round
      // Players will choose to continue or end game
      
      logger.info(`Challenge`, {
        gameId,
        challenger: playerId,
        winner: result.winner.name,
        loser: result.loser.name,
        actualCount: result.actualCount,
        bid: `${result.bid.count} ${result.bid.value}'s` 
      });
    } else {
      socket.emit('error', { message: result.message });
      logger.error(`Challenge failed - ${result.message}`, { gameId, playerId });
    }
  });
  
  // Start next round after player confirmation
  socket.on('startNextRound', ({ gameId }) => {
    const game = activeGames[gameId];
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Start next round
    game.startNextRound();
    
    // Send updated state to all players for the new round
    for (const player of game.players) {
      io.to(gameId).emit('roundStarted', { 
        state: game.getGameState(player.id),
        playerId: player.id,
        round: game.round
      });
    }
    
    // Send general game state update
    io.to(gameId).emit('gameUpdate', { state: game.getGameState() });
    
    logger.info(`New round started`, { gameId, round: game.round });
  });
  
  // End game and show leaderboard
  socket.on('endGame', ({ gameId }) => {
    const game = activeGames[gameId];
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Send end game notification to all players
    io.to(gameId).emit('gameEnded', { 
      state: game.getGameState(),
      leaderboard: Object.values(playerStats)
        .filter(player => game.players.some(p => p.id === player.id))
        .sort((a, b) => b.points - a.points)
    });
    
    // Post leaderboard to the group chat if applicable
    postLeaderboard(gameId);
    
    logger.info(`Game ended`, { gameId });
    
    // Remove the game after a delay to allow players to see final results
    setTimeout(() => {
      delete activeGames[gameId];
      delete gameOrigins[gameId];
    }, 60000); // 1 minute delay
  });
  
  // Pi (double stakes)
  socket.on('pi', ({ gameId, playerId }) => {
    const game = activeGames[gameId];
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      logger.error(`Pi failed - game not found`, { gameId, playerId });
      return;
    }
    
    if (!game.gameStarted) {
      socket.emit('error', { message: 'Game not started yet' });
      logger.error(`Pi failed - game not started`, { gameId, playerId });
      return;
    }
    
    const result = game.pi(playerId);
    
    if (result.success) {
      // Send pi result to all players
      io.to(gameId).emit('piCalled', {
        player: result.player,
        newStakes: result.newStakes,
        state: game.getGameState()
      });
      
      // Send the next player their turn notification
      const nextPlayer = game.getCurrentPlayer();
      io.to(gameId).emit('yourTurn', {
        state: game.getGameState(nextPlayer.id),
        playerId: nextPlayer.id
      });
      
      logger.info(`Pi called`, {
        gameId,
        playerId,
        newStakes: result.newStakes
      });
    } else {
      socket.emit('error', { message: result.message });
      logger.error(`Pi failed - ${result.message}`, { gameId, playerId });
    }
  });
  
  // Fold (give up after Pi)
  socket.on('fold', ({ gameId, playerId }) => {
    const game = activeGames[gameId];
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      logger.error(`Fold failed - game not found`, { gameId, playerId });
      return;
    }
    
    if (!game.gameStarted) {
      socket.emit('error', { message: 'Game not started yet' });
      logger.error(`Fold failed - game not started`, { gameId, playerId });
      return;
    }
    
    const result = game.fold(playerId);
    
    if (result.success) {
      // Update player scores in game
      game.updatePlayerScore(result.winner.id, result.loser.id, result.penalty);
      
      // Update player stats with reduced penalty
      updatePlayerStats(result.winner, result.loser, result.penalty);
      
      // Send fold results to all players with current stakes info
      io.to(gameId).emit('foldResult', {
        loser: result.loser,
        winner: result.winner,
        penalty: result.penalty,
        state: game.getGameState(),
        baseStakeValue: game.baseStakeValue
      });
      
      // Don't automatically start next round
      logger.info(`Fold`, {
        gameId,
        playerId,
        loser: result.loser.name,
        winner: result.winner.name,
        penalty: result.penalty
      });
    } else {
      socket.emit('error', { message: result.message });
      logger.error(`Fold failed - ${result.message}`, { gameId, playerId });
    }
  });
  
  // Open (challenge after Pi)
  socket.on('open', ({ gameId, playerId }) => {
    const game = activeGames[gameId];
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      logger.error(`Open failed - game not found`, { gameId, playerId });
      return;
    }
    
    if (!game.gameStarted) {
      socket.emit('error', { message: 'Game not started yet' });
      logger.error(`Open failed - game not started`, { gameId, playerId });
      return;
    }
    
    const result = game.open(playerId);
    
    if (result.success) {
      // Update player scores in game
      game.updatePlayerScore(result.winner.id, result.loser.id, game.stakes);
      
      // Update player stats with full stakes
      updatePlayerStats(result.winner, result.loser, game.stakes);
      
      // Send open results to all players
      io.to(gameId).emit('challengeResult', { 
        challenger: game.players.find(p => p.id === playerId),
        result: result,
        allDice: game.dices,
        baseStakeValue: game.baseStakeValue,
        stakes: game.stakes
      });
      
      // Don't automatically start next round
      logger.info(`Open`, {
        gameId,
        challenger: playerId,
        winner: result.winner.name,
        loser: result.loser.name,
        stakes: game.stakes
      });
    } else {
      socket.emit('error', { message: result.message });
      logger.error(`Open failed - ${result.message}`, { gameId, playerId });
    }
  });
  
  // Leave game
  socket.on('leaveGame', ({ gameId, playerId }) => {
    const game = activeGames[gameId];
    
    if (!game) {
      return;
    }
    
    if (game.removePlayer(playerId)) {
      // Leave the socket room
      socket.leave(gameId);
      
      // If game is empty, remove it
      if (game.players.length === 0) {
        delete activeGames[gameId];
        delete gameOrigins[gameId];
        logger.info(`Game removed - all players left`, { gameId });
      } else {
        // Notify other players
        io.to(gameId).emit('playerLeft', { 
          playerId,
          state: game.getGameState()
        });
      }
      
      logger.info(`Player left game`, { gameId, playerId });
    }
  });
  
  // Disconnect handling
  socket.on('disconnect', () => {
    logger.info('User disconnected', { socketId: socket.id });
    // Note: We would typically handle cleanup here,
    // but without storing socket.id to playerId mapping,
    // we'll rely on explicit leaveGame events
  });
});

// Parse game ID from URL parameter (for direct sharing)
app.get('/', (req, res, next) => {
  if (req.query.join && activeGames[req.query.join]) {
    // Set a cookie to auto-join the game
    res.cookie('joinGame', req.query.join, { maxAge: 60000 }); // 1 minute
  }
  next();
});

// Helper function to generate a game ID
function generateGameId() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});