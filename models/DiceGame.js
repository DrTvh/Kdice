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
    this.gameEnder = null; // Track who ended the game
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
    
    this.roundHistory.push({
      round: this.round,
      winner: winnerId,
      loser: loserId,
      points: points,
      dollars: points * this.baseStakeValue
    });
  }

  addPlayer(playerId, playerName) {
    if (this.players.length >= 6) {
      return false;
    }
    
    const normalizedPlayerId = playerId.startsWith('tg_') ? playerId : `tg_${playerId}`;
    
    const existingPlayerById = this.players.find(p => {
      const normalizedId = p.id.startsWith('tg_') ? p.id : `tg_${p.id}`;
      return normalizedId === normalizedPlayerId;
    });
    
    if (existingPlayerById) {
      if (playerName && playerName !== 'Player') {
        existingPlayerById.name = playerName;
      }
      return true;
    }
    
    if (playerName !== 'Player') {
      const existingPlayerByName = this.players.find(p => p.name === playerName);
      if (existingPlayerByName) {
        return true;
      }
    }
    
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
    
    if (this.lastRoundLoser !== null && this.players.some(player => player.id === this.lastRoundLoser)) {
      this.currentPlayerIndex = this.players.findIndex(player => player.id === this.lastRoundLoser);
    } else {
      this.currentPlayerIndex = Math.floor(Math.random() * this.players.length);
    }
    
    return true;
  }

  rollDices() {
    this.dices = {};
    for (const player of this.players) {
      let dice;
      do {
        dice = Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1);
      } while (!this.hasPair(dice));
      this.dices[player.id] = dice;
    }
  }
  
  // Helper method to check for at least one pair
  hasPair(dice) {
    const counts = {};
    dice.forEach(value => {
      counts[value] = (counts[value] || 0) + 1;
      if (counts[value] >= 2) return true;
    });
    return Object.values(counts).some(count => count >= 2);
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
    
    // Force TSI for bids with value 1 (jokers)
    if (value === 1 && !isTsi) {
      return { success: false, message: "Bids with 1s must be TSI (-)" };
    }
    
    // First bid of the game
    if (this.currentBid === null) {
      if (count < 3 && value !== 1) {
        return { success: false, message: "First bid must be at least 3 of any dice value" };
      } else if (count < 2) {
        return { success: false, message: "First bid must be at least 2 dice" };
      }
      
      this.currentBid = { count, value, isTsi, isFly, player: playerId };
      const nextPlayer = this.getNextPlayer();
      return { success: true };
    }
    
    let isValidBid = false;
    
    // After a bid with 1s (always TSI), require higher count
    if (this.currentBid.value === 1) {
      if (count <= this.currentBid.count) {
        return { 
          success: false, 
          message: `After a bid with 1s, you must increase the count to at least ${this.currentBid.count + 1}` 
        };
      }
      isValidBid = true;
    }
    // TSI bid
    else if (isTsi) {
      if (this.currentBid.isTsi) {
        isValidBid = (count > this.currentBid.count) || 
                     (count === this.currentBid.count && value > this.currentBid.value);
      } else {
        isValidBid = count >= this.currentBid.count; // Allows any value with same or higher count
      }
    }
    // Fly bid
    else if (isFly) {
      const minCount = this.currentBid ? this.currentBid.count * 2 : 1;
      
      if (!this.currentBid || !this.currentBid.isTsi) {
        return { 
          success: false, 
          message: "Fly (+) is only available after a Tsi (-) bid!" 
        };
      }
      
      isValidBid = count >= minCount;
      if (isValidBid) {
        this.currentBid = { count, value, isTsi: false, isFly: true, player: playerId };
        const nextPlayer = this.getNextPlayer();
        return { success: true };
      }
    }
    // Regular bid after TSI
    else if (this.currentBid.isTsi && !this.currentBid.isFly) {
      return { 
        success: false, 
        message: "After a Tsi (-) bid, you must choose Tsi (-) or Fly (+)!" 
      };
    }
    // Regular bid
    else {
      isValidBid = 
        (count > this.currentBid.count) || 
        (count === this.currentBid.count && value > this.currentBid.value);
    }
    
    if (!isValidBid) {
      let message = `Bid must be higher than the current bid: ${this.currentBid.count} ${this.currentBid.value}'s`;
      if (isTsi) {
        message = `Tsi bid must be at least ${this.currentBid.count} dice!`;
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
        totalCount += playerDices.filter(dice => dice === value).length;
      } else {
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
    
    const actualCount = this.countDiceValue(this.currentBid.value, this.currentBid.isTsi);
    
    const bidder = this.players.find(p => p.id === this.currentBid.player);
    const challenger = this.getCurrentPlayer();
    
    if (!bidder) {
      return { success: false, message: "Invalid bidder state" };
    }
    
    // In a two-player game, the opponent is the player who isn't the bidder
    const opponent = this.players.find(p => p.id !== bidder.id);
    if (!opponent) {
      return { success: false, message: "Invalid opponent state" };
    }
    
    let winner, loser;
    
    if (actualCount < this.currentBid.count) {
      winner = opponent; // Opponent wins if bid fails
      loser = bidder; // Bidder loses
    } else {
      winner = bidder; // Bidder wins if bid succeeds
      loser = opponent; // Opponent loses
    }
    
    this.lastRoundLoser = loser.id;
    this.updatePlayerScore(winner.id, loser.id, this.stakes);
    
    // Debug log to trace the outcome
    console.log(`Challenge: Bidder=${bidder.id} (${bidder.name}), Challenger=${challenger.id} (${challenger.name}), Opponent=${opponent.id} (${opponent.name}), Actual=${actualCount}, Bid=${this.currentBid.count}, Winner=${winner.id} (${winner.name}), Loser=${loser.id} (${loser.name}), Stakes=${this.stakes}`);
    
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
    
    this.stakes *= 2;
    this.piCount += 1;
    
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
    
    const prevPlayerIndex = (this.currentPlayerIndex - 1 + this.players.length) % this.players.length;
    const prevPlayer = this.players[prevPlayerIndex];
    
    const penalty = Math.floor(this.stakes / 2);
    this.lastRoundLoser = playerId;
    
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
    
    return this.challenge(playerId);
  }

  startNextRound() {
    this.round += 1;
    this.currentBid = null;
    this.stakes = 1;
    this.piCount = 0;
    this.rollDices();
    
    if (this.lastRoundLoser !== null) {
      this.currentPlayerIndex = this.players.findIndex(player => player.id === this.lastRoundLoser);
    }
    
    return true;
  }
  
  endGame() {
    this.gameEnded = true;
    
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
      leaderboard,
      endedBy: this.gameEnder
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
    
    if (forPlayerId && this.dices[forPlayerId]) {
      state.myDice = this.dices[forPlayerId];
    }
    
    return state;
  }
  
  getFoldPenalty() {
    return Math.floor(this.stakes / 2);
  }
  
  isFlyAvailable() {
    return this.currentBid && this.currentBid.isTsi;
  }
  
  getPiButtonLabel() {
    if (this.piCount === 0) return "Pi (2x)";
    if (this.piCount === 1) return "Pi (4x)";
    if (this.piCount === 2) return "Pi (8x)";
    return "Max Pi";
  }
  
  isPiAvailable() {
    return this.piCount < 3;
  }
  
  shouldUseOpenButton() {
    return this.stakes > 1;
  }
  
  isInPiResponseMode(playerId) {
    if (this.stakes === 1 || !this.currentBid) return false;
    
    return (
      this.currentPlayerIndex !== null &&
      this.players[this.currentPlayerIndex]?.id === playerId &&
      this.currentBid.player !== playerId
    );
  }
}

module.exports = DiceGame;