// index.js - Main entry point for the Telegram Mini App

// Import dependencies
const express = require('express');
const path = require('path');
const { Server } = require('socket.io');
const http = require('http');
const dotenv = require('dotenv');
const TelegramBot = require('node-telegram-bot-api');

// Setup environment variables
dotenv.config();

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

// Respond to /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Welcome to Kdice! Click below to play:", {
    reply_markup: {
      inline_keyboard: [[
        { text: "Play Kdice", web_app: { url: "https://kdice.onrender.com" } }
      ]]
    }
  });
});

// Game state storage - maps gameIds to game instances
const activeGames = {};

// Game logic (unchanged)
class DiceGame {
  constructor(gameId) {
    this.gameId = gameId;
    this.players = [];
    this.currentPlayerIndex = null;
    this.currentBid = null; // {count: Number, value: Number, isTsi: Boolean, isFly: Boolean}
    this.gameStarted = false;
    this.dices = {};
    this.lastRoundLoser = null;
    this.round = 0;
    this.stakes = 1;
    this.piCount = 0;
    this.baseStakeValue = 100; // Default stake value ($ per point)
  }

  addPlayer(playerId, playerName) {
    if (this.players.length >= 6) {
      return false;
    }
    
    if (!this.players.some(player => player.id === playerId)) {
      this.players.push({ id: playerId, name: playerName });
      return true;
    }
    
    return false;
  }

  removePlayer(playerId) {
    const index = this.players.findIndex(player => player.id === playerId);
    if (index !== -1) {
      this.players.splice(index, 1);
      return true;
    }
    return false;
  }

  startGame() {
    if (this.players.length < 2) {
      return false;
    }
    
    this.gameStarted = true;
    this.round = 1;
    this.rollDices();
    
    // Determine who starts
    if (this.lastRoundLoser !== null && this.players.some(player => player.id === this.lastRoundLoser)) {
      this.currentPlayerIndex = this.players.findIndex(player => player.id === this.lastRoundLoser);
    } else {
      // Random starter for the first game
      this.currentPlayerIndex = Math.floor(Math.random() * this.players.length);
    }
    
    return true;
  }

  rollDices() {
    this.dices = {};
    for (const player of this.players) {
      this.dices[player.id] = Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1);
    }
  }

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  getNextPlayer() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    return this.getCurrentPlayer();
  }

  placeBid(playerId, count, value, isTsi, isFly) {
    if (playerId !== this.getCurrentPlayer().id) {
      return { success: false, message: "Not your turn" };
    }
    
    // First bid of the game
    if (this.currentBid === null) {
      this.currentBid = { count, value, isTsi, isFly, player: playerId };
      this.getNextPlayer();
      return { success: true };
    }
    
    // Validate bid based on type
    let isValidBid = false;
    
    if (isTsi && this.currentBid.isTsi) {
      // Tsi after Tsi: must be higher count or same count but higher value
      isValidBid = 
        (count > this.currentBid.count) || 
        (count === this.currentBid.count && value > this.currentBid.value);
    } 
    else if (isFly) {
      // Fly after any bid: must double the count and exceed value if after Tsi
      const minCount = this.currentBid.count * 2;
      isValidBid = 
        (count >= minCount) && 
        (!this.currentBid.isTsi || value > this.currentBid.value);
    }
    else if (!isTsi && !isFly && this.currentBid.isTsi) {
      // Must specify tsi or fly after a tsi bid
      return { 
        success: false, 
        message: "After a Tsi (-) bid, you must choose Tsi (-) or Fly (+)!" 
      };
    }
    else {
      // Regular bid: must be higher count or same count but higher value
      isValidBid = 
        (count > this.currentBid.count) || 
        (count === this.currentBid.count && value > this.currentBid.value);
    }
    
    if (!isValidBid) {
      let message = `Bid must be higher than the current bid: ${this.currentBid.count} ${this.currentBid.value}'s`;
      if (isTsi) {
        message = `Tsi bid must exceed ${this.currentBid.count} ${this.currentBid.value}'s!`;
      } else if (isFly) {
        message = `Fly bid must double count to at least ${this.currentBid.count * 2}!`;
      }
      return { success: false, message };
    }
    
    this.currentBid = { count, value, isTsi, isFly, player: playerId };
    this.getNextPlayer();
    return { success: true };
  }

  countDiceValue(value, isTsi) {
    let totalCount = 0;
    
    for (const playerId in this.dices) {
      const playerDices = this.dices[playerId];
      
      if (isTsi) {
        // For Tsi, count only exact value (no jokers)
        totalCount += playerDices.filter(dice => dice === value).length;
      } else {
        // For regular bid, count both the actual value and jokers (dice showing 1)
        totalCount += playerDices.filter(dice => dice === value || dice === 1).length;
      }
    }
    
    return totalCount;
  }

  challenge(playerId) {
    if (playerId !== this.getCurrentPlayer().id) {
      return { success: false, message: "Not your turn" };
    }
    
    if (this.currentBid === null) {
      return { success: false, message: "There is no bid to challenge" };
    }
    
    // Count the actual dice
    const actualCount = this.countDiceValue(this.currentBid.value, this.currentBid.isTsi);
    
    // Previous player (the one who made the last bid)
    const prevPlayerIndex = (this.currentPlayerIndex - 1 + this.players.length) % this.players.length;
    const prevPlayer = this.players[prevPlayerIndex];
    
    let winner, loser;
    
    // If the actual count is less than the bid, challenge was successful
    if (actualCount < this.currentBid.count) {
      winner = this.getCurrentPlayer();
      loser = prevPlayer;
      this.lastRoundLoser = loser.id;
    } else {
      winner = prevPlayer;
      loser = this.getCurrentPlayer();
      this.lastRoundLoser = loser.id;
    }
    
    // End round and return results
    return {
      success: true,
      winner,
      loser,
      actualCount,
      bid: this.currentBid,
      dices: this.dices
    };
  }

  pi(playerId) {
    if (playerId !== this.getCurrentPlayer().id) {
      return { success: false, message: "Not your turn" };
    }
    
    if (this.currentBid === null) {
      return { success: false, message: "There is no bid to raise stakes on" };
    }
    
    if (this.piCount >= 3) {
      return { success: false, message: "Maximum Pi calls reached (8 points)! Use Fold or Open." };
    }
    
    // Double the stakes
    this.stakes *= 2;
    this.piCount += 1;
    
    // Next player's turn (back to the bidder)
    const prevPlayerIndex = (this.currentPlayerIndex - 1 + this.players.length) % this.players.length;
    this.currentPlayerIndex = prevPlayerIndex;
    
    return {
      success: true,
      player: this.players.find(p => p.id === playerId),
      newStakes: this.stakes
    };
  }

  fold(playerId) {
    if (playerId !== this.getCurrentPlayer().id) {
      return { success: false, message: "Not your turn" };
    }
    
    if (this.stakes === 1) {
      return { success: false, message: "No Pi to fold on" };
    }
    
    // Previous player (the one who made the last bid)
    const prevPlayerIndex = (this.currentPlayerIndex - 1 + this.players.length) % this.players.length;
    const prevPlayer = this.players[prevPlayerIndex];
    
    // Player loses half the stakes
    const penalty = Math.floor(this.stakes / 2);
    this.lastRoundLoser = playerId;
    
    return {
      success: true,
      loser: this.getCurrentPlayer(),
      winner: prevPlayer,
      penalty
    };
  }

  open(playerId) {
    if (playerId !== this.getCurrentPlayer().id) {
      return { success: false, message: "Not your turn" };
    }
    
    if (this.stakes === 1) {
      return { success: false, message: "No Pi to open" };
    }
    
    // Same as challenge but with higher stakes
    return this.challenge(playerId);
  }

  startNextRound() {
    this.round += 1;
    this.currentBid = null;
    this.stakes = 1;
    this.piCount = 0;
    this.rollDices();
    
    // Set the starting player to the loser of the previous round
    if (this.lastRoundLoser !== null) {
      this.currentPlayerIndex = this.players.findIndex(player => player.id === this.lastRoundLoser);
    }
  }

  getGameState(forPlayerId = null) {
    const state = {
      gameId: this.gameId,
      players: this.players,
      gameStarted: this.gameStarted,
      currentPlayerIndex: this.currentPlayerIndex,
      currentBid: this.currentBid,
      round: this.round,
      lastRoundLoser: this.lastRoundLoser,
      stakes: this.stakes,
      piCount: this.piCount,
      baseStakeValue: this.baseStakeValue
    };
    
    // If a specific player is requesting their state, include their dice
    if (forPlayerId && this.dices[forPlayerId]) {
      state.myDice = this.dices[forPlayerId];
    }
    
    return state;
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
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
    
    console.log(`Game created: ${gameId} by player ${playerName}`);
  });
  
  // Join an existing game
  socket.on('joinGame', ({ gameId, playerName, playerId }) => {
    const game = activeGames[gameId];
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    if (game.gameStarted) {
      socket.emit('error', { message: 'Game already started' });
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
      
      console.log(`Player ${playerName} joined game ${gameId}`);
    } else {
      socket.emit('error', { message: 'Failed to join game' });
    }
  });
  
  // Start the game
  socket.on('startGame', ({ gameId, playerId }) => {
    const game = activeGames[gameId];
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    if (game.gameStarted) {
      socket.emit('error', { message: 'Game already started' });
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
      
      console.log(`Game ${gameId} started with ${game.players.length} players`);
    } else {
      socket.emit('error', { message: 'Cannot start game, need at least 2 players' });
    }
  });
  
  // Place a bid
  socket.on('placeBid', ({ gameId, playerId, count, value, isTsi, isFly }) => {
    const game = activeGames[gameId];
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    if (!game.gameStarted) {
      socket.emit('error', { message: 'Game not started yet' });
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
      
      console.log(`Player ${playerId} placed bid: ${count} ${value}'s ${isTsi ? '(Tsi)' : ''} ${isFly ? '(Fly)' : ''} in game ${gameId}`);
    } else {
      socket.emit('error', { message: result.message });
    }
  });
  
  // Challenge a bid
  socket.on('challenge', ({ gameId, playerId }) => {
    const game = activeGames[gameId];
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    if (!game.gameStarted) {
      socket.emit('error', { message: 'Game not started yet' });
      return;
    }
    
    const result = game.challenge(playerId);
    
    if (result.success) {
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
        
        console.log(`New round started in game ${gameId}`);
      }, 5000); // 5 second delay to show results before next round
      
      console.log(`Player ${playerId} challenged in game ${gameId}`);
    } else {
      socket.emit('error', { message: result.message });
    }
  });
  
  // Pi (double stakes)
  socket.on('pi', ({ gameId, playerId }) => {
    const game = activeGames[gameId];
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    if (!game.gameStarted) {
      socket.emit('error', { message: 'Game not started yet' });
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
      
      console.log(`Player ${playerId} called Pi in game ${gameId}, stakes now ${result.newStakes}`);
    } else {
      socket.emit('error', { message: result.message });
    }
  });
  
  // Fold (give up after Pi)
  socket.on('fold', ({ gameId, playerId }) => {
    const game = activeGames[gameId];
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    if (!game.gameStarted) {
      socket.emit('error', { message: 'Game not started yet' });
      return;
    }
    
    const result = game.fold(playerId);
    
    if (result.success) {
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
        
        console.log(`New round started in game ${gameId} after fold`);
      }, 3000); // 3 second delay before next round
      
      console.log(`Player ${playerId} folded in game ${gameId}`);
    } else {
      socket.emit('error', { message: result.message });
    }
  });
  
  // Open (challenge after Pi)
  socket.on('open', ({ gameId, playerId }) => {
    const game = activeGames[gameId];
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    if (!game.gameStarted) {
      socket.emit('error', { message: 'Game not started yet' });
      return;
    }
    
    const result = game.open(playerId);
    
    if (result.success) {
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
        
        console.log(`New round started in game ${gameId} after open`);
      }, 5000); // 5 second delay to show results before next round
      
      console.log(`Player ${playerId} opened in game ${gameId}`);
    } else {
      socket.emit('error', { message: result.message });
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
        console.log(`Game ${gameId} removed as all players left`);
      } else {
        // Notify other players
        io.to(gameId).emit('playerLeft', { 
          playerId,
          state: game.getGameState()
        });
      }
      
      console.log(`Player ${playerId} left game ${gameId}`);
    }
  });
  
  // Disconnect handling
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
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
  console.log(`Server running on port ${PORT}`);
});