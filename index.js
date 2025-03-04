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

// Respond to /start command - works in both direct and group chats
bot.onText(/\/start(@KdiceBot)?/, (msg) => {
  const chatId = msg.chat.id;
  
  // Check if it's a group chat
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
  
  // For groups, use a different approach
  if (isGroup) {
    bot.sendMessage(chatId, "Welcome to Kdice! Start a game directly at https://kdice.onrender.com");
  } else {
    // For private chats, use web_app button
    bot.sendMessage(chatId, "Welcome to Kdice! Click below to play:", {
      reply_markup: {
        inline_keyboard: [[
          { text: "Play Kdice", web_app: { url: "https://kdice.onrender.com" } }
        ]]
      }
    });
  }
  
  // Debug log
  logger.info(`Start command received`, {
    username: msg.from.username || msg.from.first_name,
    chatType: msg.chat.type,
    chatId: chatId
  });
});

// Game state storage - maps gameIds to game instances
const activeGames = {};

// Player stats storage
const playerStats = {};

// Function to update player stats
function updatePlayerStats(winner, loser, stakes) {
  // Initialize player stats if needed
  if (!playerStats[winner.id]) {
    playerStats[winner.id] = { 
      name: winner.name, 
      wins: 0, 
      losses: 0,
      points: 0
    };
  }
  if (!playerStats[loser.id]) {
    playerStats[loser.id] = { 
      name: loser.name, 
      wins: 0, 
      losses: 0,
      points: 0 
    };
  }
  
  // Update stats
  playerStats[winner.id].wins += 1;
  playerStats[winner.id].points += stakes;
  playerStats[loser.id].losses += 1;
  playerStats[loser.id].points -= stakes;
  
  logger.info(`Stats updated`, {
    winner: winner.name,
    loser: loser.name,
    stakes: stakes,
    winnerNewPoints: playerStats[winner.id].points,
    loserNewPoints: playerStats[loser.id].points
  });
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
  socket.on('createGame', ({ playerName, playerId }) => {
    const gameId = generateGameId();
    const game = new DiceGame(gameId);
    
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
    
    logger.info(`Game created`, { gameId, playerName, playerId });
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
      // Send updated game state to all players
      io.to(gameId).emit('bidPlaced', { 
        player: game.players.find(p => p.id === playerId),
        bid: { count, value, isTsi, isFly },
        state: game.getGameState()
      });
      
      // Send the next player their dice
      const nextPlayer = game.getCurrentPlayer();
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
        isFly
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
      // Update player stats
      updatePlayerStats(result.winner, result.loser, game.stakes);
      
      // Send challenge results to all players
      io.to(gameId).emit('challengeResult', { 
        challenger: game.players.find(p => p.id === playerId),
        result: result,
        allDice: game.dices
      });
      
      // Start next round after a delay
      setTimeout(() => {
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
      }, 5000); // 5 second delay to show results before next round
      
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
      // Update player stats with reduced penalty
      updatePlayerStats(result.winner, result.loser, result.penalty);
      
      // Send fold results to all players
      io.to(gameId).emit('foldResult', {
        loser: result.loser,
        winner: result.winner,
        penalty: result.penalty,
        state: game.getGameState()
      });
      
      // Start next round after a delay
      setTimeout(() => {
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
        
        logger.info(`New round started after fold`, { gameId, round: game.round });
      }, 3000); // 3 second delay before next round
      
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
      // Update player stats with full stakes
      updatePlayerStats(result.winner, result.loser, game.stakes);
      
      // Send open results to all players
      io.to(gameId).emit('challengeResult', { 
        challenger: game.players.find(p => p.id === playerId),
        result: result,
        allDice: game.dices
      });
      
      // Start next round after a delay
      setTimeout(() => {
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
        
        logger.info(`New round started after open`, { gameId, round: game.round });
      }, 5000); // 5 second delay to show results before next round
      
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