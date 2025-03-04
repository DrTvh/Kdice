// models/DiceGame.js
class DiceGame {
  constructor(gameId) {
    this.gameId = gameId;
    this.players = [];
    this.currentPlayerIndex = null;
    this.currentBid = null; // {count: Number, value: Number, isTsi: Boolean, isFly: Boolean}
    this.gameStarted = false;
    this.gameEnded = false;
    this.dices = {};
    this.lastRoundLoser = null;
    this.round = 0;
    this.stakes = 1;
    this.piCount = 0;
    this.baseStakeValue = 100; // Default stake value ($ per point)
    this.playerScores = {}; // Track points for this game
    this.originChatId = null; // Track if game came from a group chat
    this.roundHistory = []; // Track round results
  }

  updatePlayerScore(winnerId, loserId, points) {
    if (!this.playerScores[winnerId]) {
      this.playerScores[winnerId] = 0;
    }
    if (!this.playerScores[loserId]) {
      this.playerScores[loserId] = 0;
    }
    
    this.playerScores[winnerId] += points;
    this.playerScores[loserId] -= points;
    
    // Add to round history
    this.roundHistory.push({
      round: this.round,
      winner: winnerId,
      loser: loserId,
      points: points,
      dollars: points * this.baseStakeValue
    });
  }

  addPlayer(playerId, playerName) {
    // Check max players
    if (this.players.length >= 6) {
      return false;
    }
    
    // Normalize the player ID - strip the prefix if present
    const normalizedPlayerId = playerId.startsWith('tg_') 
      ? playerId 
      : `tg_${playerId}`;
    
    // Check if player already exists by normalized ID
    const existingPlayerById = this.players.find(p => {
      const normalizedId = p.id.startsWith('tg_') ? p.id : `tg_${p.id}`;
      return normalizedId === normalizedPlayerId;
    });
    
    if (existingPlayerById) {
      // Player already exists by ID - update name if provided
      if (playerName && playerName !== 'Player') {
        existingPlayerById.name = playerName;
      }
      return true; // Return true to indicate success (player exists)
    }
    
    // Check by name (only if not a generic name)
    if (playerName !== 'Player') {
      const existingPlayerByName = this.players.find(p => p.name === playerName);
      if (existingPlayerByName) {
        return true; // Return true to indicate success (player exists by name)
      }
    }
    
    // Add the new player with normalized ID
    this.players.push({ id: normalizedPlayerId, name: playerName });
    return true;
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
    this.gameEnded = false;
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
    console.log('PlaceBid called', { playerId, currentPlayer: this.getCurrentPlayer()?.id });
    
    if (playerId !== this.getCurrentPlayer().id) {
      return { success: false, message: "Not your turn" };
    }
    
    // First bid of the game
    if (this.currentBid === null) {
      this.currentBid = { count, value, isTsi, isFly, player: playerId };
      console.log('Before getNextPlayer', { currentIndex: this.currentPlayerIndex });
      const nextPlayer = this.getNextPlayer();
      console.log('After getNextPlayer', { currentIndex: this.currentPlayerIndex, nextPlayer: nextPlayer?.id });
      return { success: true };
    }
    
    // Validate bid based on type
    let isValidBid = false;
    
    if (isTsi) {
      if (this.currentBid && this.currentBid.isTsi) {
        // Tsi after Tsi: must be higher count or same count but higher value
        isValidBid = 
          (count > this.currentBid.count) || 
          (count === this.currentBid.count && value > this.currentBid.value);
      } else if (this.currentBid) {
        // TSI after regular bid: can be equal or higher count with any value
        isValidBid = count >= this.currentBid.count;
      } else {
        // First bid of the game
        isValidBid = true;
      }
    }
    else if (isFly) {
      // Fly after any bid: must double the count and exceed value if after Tsi
      const minCount = this.currentBid ? this.currentBid.count * 2 : 1;
      isValidBid = 
        (count >= minCount) && 
        (!this.currentBid || !this.currentBid.isTsi || value > this.currentBid.value);
    }
    else if (this.currentBid && this.currentBid.isTsi) {
      // Must specify tsi or fly after a tsi bid
      return { 
        success: false, 
        message: "After a Tsi (-) bid, you must choose Tsi (-) or Fly (+)!" 
      };
    }
    else {
      // Regular bid: must be higher count or same count but higher value
      isValidBid = 
        !this.currentBid || 
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
    const nextPlayer = this.getNextPlayer();
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
    
    // Update scores based on current stakes
    this.updatePlayerScore(winner.id, loser.id, this.stakes);
    
    // End round and return results
    return {
      success: true,
      winner,
      loser,
      actualCount,
      bid: this.currentBid,
      dices: this.dices,
      stakes: this.stakes
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
      newStakes: this.stakes,
      piCount: this.piCount
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
    
    // Update scores
    this.updatePlayerScore(prevPlayer.id, playerId, penalty);
    
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
    const result = this.challenge(playerId);
    return result;
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
    
    return true;
  }
  
  endGame() {
    this.gameEnded = true;
    
    // Generate leaderboard based on player scores
    const leaderboard = Object.keys(this.playerScores)
      .map(playerId => {
        const player = this.players.find(p => p.id === playerId);
        return {
          id: playerId,
          name: player ? player.name : 'Unknown',
          points: this.playerScores[playerId],
          dollars: this.playerScores[playerId] * this.baseStakeValue
        };
      })
      .sort((a, b) => b.points - a.points);
    
    return {
      success: true,
      leaderboard
    };
  }

  getGameState(forPlayerId = null) {
    const state = {
      gameId: this.gameId,
      players: this.players,
      gameStarted: this.gameStarted,
      gameEnded: this.gameEnded,
      currentPlayerIndex: this.currentPlayerIndex,
      currentBid: this.currentBid,
      round: this.round,
      lastRoundLoser: this.lastRoundLoser,
      stakes: this.stakes,
      piCount: this.piCount,
      baseStakeValue: this.baseStakeValue,
      playerScores: this.playerScores,
      roundHistory: this.roundHistory
    };
    
    // If a specific player is requesting their state, include their dice
    if (forPlayerId && this.dices[forPlayerId]) {
      state.myDice = this.dices[forPlayerId];
    }
    
    return state;
  }
  
  // Helper method to calculate fold penalty
  getFoldPenalty() {
    return Math.floor(this.stakes / 2);
  }
  
  // Helper to determine if Fly is available - only after a Tsi bid
  isFlyAvailable() {
    return this.currentBid && this.currentBid.isTsi;
  }
  
  // Get the current Pi button label based on Pi count
  getPiButtonLabel() {
    if (this.piCount === 0) return "Pi (2x)";
    if (this.piCount === 1) return "Pi (4x)";
    if (this.piCount === 2) return "Pi (8x)";
    return "Max Pi";
  }
  
  // Check if Pi is available (max 3 times)
  isPiAvailable() {
    return this.piCount < 3;
  }
}

module.exports = DiceGame;