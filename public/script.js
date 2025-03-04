// Initialize Telegram WebApp
const tgApp = window.Telegram.WebApp;
tgApp.expand();
tgApp.ready();

// Connect to Socket.io server
const socket = io();

// Extract user data, prioritizing Telegram WebApp data
let userData = {
  id: 'player_' + Math.random().toString(36).substring(2, 10),
  name: 'Player'
};

// Prefer Telegram WebApp data if available
if (tgApp.initDataUnsafe && tgApp.initDataUnsafe.user) {
  const user = tgApp.initDataUnsafe.user;
  userData = {
    id: 'tg_' + user.id.toString(),
    name: user.first_name || (user.username ? '@' + user.username : 'Player')
  };
  console.log('Telegram user data loaded:', userData);
} else {
  // Fallback to URL parameters if outside Telegram (unlikely)
  const urlParams = new URLSearchParams(window.location.search);
  const urlUserId = urlParams.get('userId');
  const urlUserName = urlParams.get('userName');
  if (urlUserId && urlUserName) {
    userData = {
      id: 'tg_' + urlUserId,
      name: urlUserName
    };
    console.log('URL user data loaded:', userData);
  }
}

// Game state variables
let game = {
  gameId: null,
  playerId: userData.id,
  playerName: userData.name,
  myDice: [],
  currentBid: null,
  currentPlayerIndex: null,
  isMyTurn: false,
  bidHistory: [],
  bidCount: 1,
  bidValue: 2,
  maxCount: 30, // This will be updated based on player count
  isTsi: false,  // Track if current bid is tsi
  isFly: false,  // Track if current bid is fly
  piCount: 0,    // Count of Pi calls in current round
  stakes: 1,     // Current stake multiplier
  baseStakeValue: 100, // Base stake value ($ per point)
  playerScores: {}, // Track scores for each player
  selectedStake: 100, // Default stake value
  roundHistory: [], // Track round results
  players: [],      // Players in the game
  gameEnded: false, // Track if the game has ended
  endedBy: null     // Track who ended the game
};

// DOM Elements
const screens = {
  welcome: document.getElementById('welcomeScreen'),
  lobby: document.getElementById('lobbyScreen'),
  game: document.getElementById('gameScreen'),
  challengeResult: document.getElementById('challengeResultScreen'),
  roundSummary: document.getElementById('roundSummaryScreen'),
  gameEnd: document.getElementById('gameEndScreen')
};

// Check for game join parameter
function checkForGameJoin() {
  const urlParams = new URLSearchParams(window.location.search);
  const gameIdToJoin = urlParams.get('join');
  
  if (gameIdToJoin) {
    document.getElementById('gameIdInput').value = gameIdToJoin;
    // Auto join after a short delay
    setTimeout(() => {
      document.getElementById('joinGameBtn').click();
    }, 500);
  }

  // Also check cookies
  const joinGameCookie = getCookie('joinGame');
  if (joinGameCookie) {
    document.getElementById('gameIdInput').value = joinGameCookie;
    // Auto join after a short delay
    setTimeout(() => {
      document.getElementById('joinGameBtn').click();
      // Clear the cookie after joining
      document.cookie = "joinGame=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    }, 500);
  }
}

// Helper function to get a cookie by name
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
}

// Helper functions for game state and UI
function updateGameState(state, updateDice = true) {
  // Only update dice if specified
  if (updateDice && state.myDice) {
    game.myDice = state.myDice;
  }
  
  game.players = state.players || game.players;
  game.currentPlayerIndex = state.currentPlayerIndex;
  game.currentBid = state.currentBid;
  game.stakes = state.stakes || game.stakes;
  game.piCount = state.piCount || game.piCount;
  game.baseStakeValue = state.baseStakeValue || game.baseStakeValue;
  game.playerScores = state.playerScores || {};
  game.round = state.round || game.round;
  game.roundHistory = state.roundHistory || [];
  game.gameEnded = state.gameEnded || false;
  
  // Check if it's my turn
  if (game.currentPlayerIndex !== null) {
    const currentPlayerId = game.players[game.currentPlayerIndex]?.id;
    game.isMyTurn = currentPlayerId === game.playerId;
  } else {
    game.isMyTurn = false;
  }
}

// Helper function to switch screens
function showScreen(screenName) {
  Object.keys(screens).forEach(key => {
    screens[key].classList.remove('active');
  });
  screens[screenName].classList.add('active');
}

// Helper function to create dice dots pattern
function createDiceDots(value, isJoker) {
  const diceElem = document.createElement('div');
  diceElem.className = `dice ${isJoker ? 'joker' : ''}`;
  
  // For 1 (center dot)
  if (value === 1) {
    const dot = document.createElement('div');
    dot.className = 'dice-dot';
    dot.style.position = 'absolute';
    dot.style.top = '50%';
    dot.style.left = '50%';
    dot.style.transform = 'translate(-50%, -50%)';
    diceElem.appendChild(dot);
  }
  // For 2 (top-left and bottom-right)
  else if (value === 2) {
    const dot1 = document.createElement('div');
    dot1.className = 'dice-dot';
    dot1.style.position = 'absolute';
    dot1.style.top = '25%';
    dot1.style.left = '25%';
    diceElem.appendChild(dot1);
    
    const dot2 = document.createElement('div');
    dot2.className = 'dice-dot';
    dot2.style.position = 'absolute';
    dot2.style.bottom = '25%';
    dot2.style.right = '25%';
    diceElem.appendChild(dot2);
  }
  // For 3 (1 + 2)
  else if (value === 3) {
    // Center dot
    const dot1 = document.createElement('div');
    dot1.className = 'dice-dot';
    dot1.style.position = 'absolute';
    dot1.style.top = '50%';
    dot1.style.left = '50%';
    dot1.style.transform = 'translate(-50%, -50%)';
    diceElem.appendChild(dot1);
    
    // Top-left dot
    const dot2 = document.createElement('div');
    dot2.className = 'dice-dot';
    dot2.style.position = 'absolute';
    dot2.style.top = '25%';
    dot2.style.left = '25%';
    diceElem.appendChild(dot2);
    
    // Bottom-right dot
    const dot3 = document.createElement('div');
    dot3.className = 'dice-dot';
    dot3.style.position = 'absolute';
    dot3.style.bottom = '25%';
    dot3.style.right = '25%';
    diceElem.appendChild(dot3);
  }
  // For 4 (in all corners)
  else if (value === 4) {
    // Top-left dot
    const dot1 = document.createElement('div');
    dot1.className = 'dice-dot';
    dot1.style.position = 'absolute';
    dot1.style.top = '25%';
    dot1.style.left = '25%';
    diceElem.appendChild(dot1);
    
    // Top-right dot
    const dot2 = document.createElement('div');
    dot2.className = 'dice-dot';
    dot2.style.position = 'absolute';
    dot2.style.top = '25%';
    dot2.style.right = '25%';
    diceElem.appendChild(dot2);
    
    // Bottom-left dot
    const dot3 = document.createElement('div');
    dot3.className = 'dice-dot';
    dot3.style.position = 'absolute';
    dot3.style.bottom = '25%';
    dot3.style.left = '25%';
    diceElem.appendChild(dot3);
    
    // Bottom-right dot
    const dot4 = document.createElement('div');
    dot4.className = 'dice-dot';
    dot4.style.position = 'absolute';
    dot4.style.bottom = '25%';
    dot4.style.right = '25%';
    diceElem.appendChild(dot4);
  }
  // For 5 (4 + center)
  else if (value === 5) {
    // Center dot
    const dot1 = document.createElement('div');
    dot1.className = 'dice-dot';
    dot1.style.position = 'absolute';
    dot1.style.top = '50%';
    dot1.style.left = '50%';
    dot1.style.transform = 'translate(-50%, -50%)';
    diceElem.appendChild(dot1);
    
    // Top-left dot
    const dot2 = document.createElement('div');
    dot2.className = 'dice-dot';
    dot2.style.position = 'absolute';
    dot2.style.top = '25%';
    dot2.style.left = '25%';
    diceElem.appendChild(dot2);
    
    // Top-right dot
    const dot3 = document.createElement('div');
    dot3.className = 'dice-dot';
    dot3.style.position = 'absolute';
    dot3.style.top = '25%';
    dot3.style.right = '25%';
    diceElem.appendChild(dot3);
    
    // Bottom-left dot
    const dot4 = document.createElement('div');
    dot4.className = 'dice-dot';
    dot4.style.position = 'absolute';
    dot4.style.bottom = '25%';
    dot4.style.left = '25%';
    diceElem.appendChild(dot4);
    
    // Bottom-right dot
    const dot5 = document.createElement('div');
    dot5.className = 'dice-dot';
    dot5.style.position = 'absolute';
    dot5.style.bottom = '25%';
    dot5.style.right = '25%';
    diceElem.appendChild(dot5);
  }
  // For 6 (like 4 but with middle row added)
  else if (value === 6) {
    // Top-left dot
    const dot1 = document.createElement('div');
    dot1.className = 'dice-dot';
    dot1.style.position = 'absolute';
    dot1.style.top = '25%';
    dot1.style.left = '25%';
    diceElem.appendChild(dot1);
    
    // Top-right dot
    const dot2 = document.createElement('div');
    dot2.className = 'dice-dot';
    dot2.style.position = 'absolute';
    dot2.style.top = '25%';
    dot2.style.right = '25%';
    diceElem.appendChild(dot2);
    
    // Middle-left dot
    const dot3 = document.createElement('div');
    dot3.className = 'dice-dot';
    dot3.style.position = 'absolute';
    dot3.style.top = '50%';
    dot3.style.left = '25%';
    dot3.style.transform = 'translateY(-50%)';
    diceElem.appendChild(dot3);
    
    // Middle-right dot
    const dot4 = document.createElement('div');
    dot4.className = 'dice-dot';
    dot4.style.position = 'absolute';
    dot4.style.top = '50%';
    dot4.style.right = '25%';
    dot4.style.transform = 'translateY(-50%)';
    diceElem.appendChild(dot4);
    
    // Bottom-left dot
    const dot5 = document.createElement('div');
    dot5.className = 'dice-dot';
    dot5.style.position = 'absolute';
    dot5.style.bottom = '25%';
    dot5.style.left = '25%';
    diceElem.appendChild(dot5);
    
    // Bottom-right dot
    const dot6 = document.createElement('div');
    dot6.className = 'dice-dot';
    dot6.style.position = 'absolute';
    dot6.style.bottom = '25%';
    dot6.style.right = '25%';
    diceElem.appendChild(dot6);
  }
  
  return diceElem;
}

// Initialize bid buttons for bid selection
function initializeBidButtons() {
  const countButtons = document.getElementById('countButtons');
  const valueButtons = document.getElementById('valueButtons');
  
  // Clear existing buttons
  countButtons.innerHTML = '';
  valueButtons.innerHTML = '';
  
  // Calculate max count based on number of players (5 dice per player, max 6 players)
  game.maxCount = Math.min(game.players.length, 6) * 5;
  
  // Create count buttons dynamically
  for (let i = 1; i <= game.maxCount; i++) {
    const button = document.createElement('button');
    button.className = 'number-button';
    button.textContent = i;
    button.dataset.count = i;
    button.addEventListener('click', () => {
      selectCount(i);
    });
    countButtons.appendChild(button);
  }
  
  // Create value buttons (1 to 6) - including 1 as requested
  for (let i = 1; i <= 6; i++) {
    const button = document.createElement('button');
    button.className = 'number-button dice-value-button';
    button.dataset.value = i;
    
    // Create a mini dice visual instead of numbers
    const miniDice = createDiceDots(i, i === 1);
    miniDice.style.width = '30px';
    miniDice.style.height = '30px';
    button.appendChild(miniDice);
    
    button.addEventListener('click', () => {
      selectValue(i);
      
      // When selecting value 1, automatically enable TSI mode
      if (i === 1) {
        game.isTsi = true;
        game.isFly = false;
        document.getElementById('tsiBtn').classList.add('selected');
        document.getElementById('flyBtn').classList.remove('selected');
      }
    });
    valueButtons.appendChild(button);
  }
  
  // Mark initial selections
  selectCount(game.bidCount);
  selectValue(game.bidValue);
  
  // Update bid validity (to show/hide invalid options)
  updateBidValidity();
}

function selectCount(count) {
  game.bidCount = count;
  
  // Update UI to show selection
  const countButtons = document.querySelectorAll('#countButtons .number-button');
  countButtons.forEach(button => {
    if (parseInt(button.dataset.count) === count) {
      button.classList.add('selected');
    } else {
      button.classList.remove('selected');
    }
  });
  
  updateBidValidity();
}

function selectValue(value) {
  game.bidValue = value;
  
  // Update UI to show selection
  const valueButtons = document.querySelectorAll('#valueButtons .number-button');
  valueButtons.forEach(button => {
    if (parseInt(button.dataset.value) === value) {
      button.classList.add('selected');
    } else {
      button.classList.remove('selected');
    }
  });
  
  updateBidValidity();
}

function updateBidValidity() {
  // If there's a current bid, hide invalid options
  if (game.currentBid) {
    const countButtons = document.querySelectorAll('#countButtons .number-button');
    const valueButtons = document.querySelectorAll('#valueButtons .number-button');
    
    // First, reset all to visible
    countButtons.forEach(button => button.style.display = 'flex');
    valueButtons.forEach(button => button.style.display = 'flex');
    
    // Check if previous bid is in TSI mode (either explicitly or with value 1)
    const previousIsTSI = game.currentBid.isTsi || game.currentBid.value === 1;
    
    if (game.isTsi) {
      if (previousIsTSI) {
        // Tsi after Tsi: standard rule
        countButtons.forEach(button => {
          const count = parseInt(button.dataset.count);
          const isValidCount = count > game.currentBid.count;
          const isValidEqualCount = count === game.currentBid.count;
          
          if (!isValidCount && !isValidEqualCount) {
            button.style.display = 'none';
          }
        });
        
        valueButtons.forEach(button => {
          const value = parseInt(button.dataset.value);
          if (game.bidCount === game.currentBid.count && value <= game.currentBid.value) {
            button.style.display = 'none';
          }
        });
      } else {
        // Tsi after regular bid: can have equal or higher count with any value
        countButtons.forEach(button => {
          const count = parseInt(button.dataset.count);
          if (game.currentBid && count < game.currentBid.count) {
            button.style.display = 'none';
          }
        });
      }
    } 
    else if (game.isFly) {
      // Fly: must double the count
      const minCount = game.currentBid.count * 2;
      
      countButtons.forEach(button => {
        const count = parseInt(button.dataset.count);
        if (count < minCount) {
          button.style.display = 'none';
        }
      });
    }
    else {
      // Regular bid after regular bid: standard rules
      countButtons.forEach(button => {
        const count = parseInt(button.dataset.count);
        
        // Count is valid if it's greater than current bid count
        const isValidCount = count > game.currentBid.count;
        
        // Equal count is valid only if we can increase value
        const isValidEqualCount = count === game.currentBid.count;
        
        if (!isValidCount && !isValidEqualCount) {
          button.style.display = 'none';
        }
      });
      
      valueButtons.forEach(button => {
        const value = parseInt(button.dataset.value);
        
        // If count equals current bid count, value must be greater
        if (game.bidCount === game.currentBid.count && value <= game.currentBid.value) {
          button.style.display = 'none';
        }
      });
    }
  } else {
    // No current bid, all options are valid
    const countButtons = document.querySelectorAll('#countButtons .number-button');
    const valueButtons = document.querySelectorAll('#valueButtons .number-button');
    
    countButtons.forEach(button => {
      button.style.display = 'flex';
    });
    
    valueButtons.forEach(button => {
      button.style.display = 'flex';
    });
  }
}

// Register event listeners after DOM has fully loaded
document.addEventListener('DOMContentLoaded', function() {
  // Add event listeners for stake buttons
  document.querySelectorAll('.stake-button').forEach(button => {
    button.addEventListener('click', () => {
      const stake = parseInt(button.dataset.stake);
      game.selectedStake = stake;
      
      // Update UI
      document.querySelectorAll('.stake-button').forEach(btn => {
        btn.classList.remove('selected');
      });
      button.classList.add('selected');
    });
  });

  // Add event listeners for tsi/fly buttons
  document.getElementById('tsiBtn').addEventListener('click', () => {
    if (!game.isMyTurn) {
      return; // Silently ignore if not your turn
    }
    
    // Toggle TSI
    if (game.isTsi) {
      // Can't turn off TSI if value is 1
      if (game.bidValue === 1) {
        return;
      }
      game.isTsi = false;
      document.getElementById('tsiBtn').classList.remove('selected');
    } else {
      game.isTsi = true;
      game.isFly = false;
      document.getElementById('tsiBtn').classList.add('selected');
      document.getElementById('flyBtn').classList.remove('selected');
    }
    
    // Update bid validity for Tsi/Fly
    updateBidValidity();
  });

  document.getElementById('flyBtn').addEventListener('click', () => {
    if (!game.isMyTurn) {
      return; // Silently ignore if not your turn
    }
    
    // FLY is only valid after a TSI bid or bid with value 1
    if (!game.currentBid || !(game.currentBid.isTsi || game.currentBid.value === 1)) {
      // Fly is not available without a preceding Tsi bid
      return;
    }
    
    // Toggle FLY
    if (game.isFly) {
      game.isFly = false;
      document.getElementById('flyBtn').classList.remove('selected');
    } else {
      game.isFly = true;
      game.isTsi = false;
      document.getElementById('flyBtn').classList.add('selected');
      document.getElementById('tsiBtn').classList.remove('selected');
    }
    
    // Update bid validity for Tsi/Fly
    updateBidValidity();
  });

  // Add event listeners for Pi, Fold, Open buttons
  document.getElementById('piBtn').addEventListener('click', () => {
    if (!game.isMyTurn) {
      return; // Silently ignore if not your turn
    }
    
    if (!game.currentBid) {
      alert('No bid to raise stakes on!');
      return;
    }
    
    if (game.piCount >= 3) {
      alert('Maximum Pi calls reached (8 points)! Use Fold or Open.');
      return;
    }
    
    // Double the stakes
    socket.emit('pi', {
      gameId: game.gameId,
      playerId: game.playerId
    });
    
    game.isMyTurn = false;
    updateGameControls();
  });

  document.getElementById('foldBtn').addEventListener('click', () => {
    if (!game.isMyTurn) {
      return; // Silently ignore if not your turn
    }
    
    if (game.stakes === 1) {
      alert('No Pi to fold on!');
      return;
    }
    
    socket.emit('fold', {
      gameId: game.gameId,
      playerId: game.playerId
    });
    
    game.isMyTurn = false;
    updateGameControls();
  });

  document.getElementById('openBtn').addEventListener('click', () => {
    if (!game.isMyTurn) {
      return; // Silently ignore if not your turn
    }
    
    if (game.stakes === 1) {
      alert('No Pi to open!');
      return;
    }
    
    socket.emit('open', {
      gameId: game.gameId,
      playerId: game.playerId
    });
    
    game.isMyTurn = false;
    updateGameControls();
  });

  // Create new game
  document.getElementById('createGameBtn').addEventListener('click', () => {
    socket.emit('createGame', {
      playerName: game.playerName,
      playerId: game.playerId,
      stakeValue: game.selectedStake
    });
  });

  // Join existing game
  document.getElementById('joinGameBtn').addEventListener('click', () => {
    const gameId = document.getElementById('gameIdInput').value.trim();
    if (gameId) {
      socket.emit('joinGame', {
        gameId,
        playerName: game.playerName,
        playerId: game.playerId
      });
    } else {
      alert('Please enter a valid Game ID');
    }
  });

  // Start game
  document.getElementById('startGameBtn').addEventListener('click', () => {
    socket.emit('startGame', {
      gameId: game.gameId,
      playerId: game.playerId
    });
  });

  // Handle "Next Round" button
  document.getElementById('nextRoundBtn').addEventListener('click', () => {
    socket.emit('startNextRound', {
      gameId: game.gameId
    });
  });

  // Handle "End Game" button
  document.getElementById('endGameBtn').addEventListener('click', () => {
    socket.emit('endGame', {
      gameId: game.gameId,
      playerId: game.playerId
    });
  });

  // Return to home screen
  document.getElementById('returnHomeBtn').addEventListener('click', () => {
    window.location.href = '/'; // Reload the page to start fresh
  });

  // Close app button (for game end screen)
  document.getElementById('closeAppBtn').addEventListener('click', () => {
    tgApp.close();
  });

  // Leave lobby
  document.getElementById('leaveLobbyBtn').addEventListener('click', () => {
    socket.emit('leaveGame', {
      gameId: game.gameId,
      playerId: game.playerId
    });
    game.gameId = null;
    showScreen('welcome');
  });

  // Leave game
  document.getElementById('leaveGameBtn').addEventListener('click', () => {
    socket.emit('leaveGame', {
      gameId: game.gameId,
      playerId: game.playerId
    });
    game.gameId = null;
    showScreen('welcome');
  });

  // Place bid
  document.getElementById('bidBtn').addEventListener('click', () => {
    if (!game.isMyTurn) {
      return; // Silently ignore if not your turn
    }
    
    // Make sure value=1 is always Tsi mode
    if (game.bidValue === 1) {
      game.isTsi = true;
    }
    
    // Validate bid against current bid
    if (game.currentBid) {
      let isValidBid = false;
      
      // Check if previous bid is in TSI mode (either explicitly or with value 1)
      const previousIsTSI = game.currentBid.isTsi || game.currentBid.value === 1;
      
      if (game.isTsi) {
        if (previousIsTSI) {
          // Tsi after Tsi: must be higher count or same count but higher value
          isValidBid = 
            (game.bidCount > game.currentBid.count) || 
            (game.bidCount === game.currentBid.count && game.bidValue > game.currentBid.value);
        } else {
          // Tsi after regular bid: can be equal or higher count with any value
          isValidBid = game.bidCount >= game.currentBid.count;
        }
      }
      else if (game.isFly) {
        // Fly after any bid: must double the count
        const minCount = game.currentBid.count * 2;
        isValidBid = game.bidCount >= minCount;
      }
      else if (previousIsTSI) {
        // Must specify tsi or fly after a tsi bid
        alert('After a Tsi (-) bid or a bid with 1s, you must choose Tsi (-) or Fly (+)!');
        return;
      }
      else {
        // Regular bid: must be higher count or same count but higher value
        isValidBid = 
          (game.bidCount > game.currentBid.count) || 
          (game.bidCount === game.currentBid.count && game.bidValue > game.currentBid.value);
      }
      
      if (!isValidBid) {
        if (game.isTsi) {
          alert(`Tsi bid must be at least ${game.currentBid.count} dice!`);
        } else if (game.isFly) {
          alert(`Fly bid must double count to at least ${game.currentBid.count * 2}!`);
        } else {
          alert(`Your bid must be higher than ${game.currentBid.count} ${game.currentBid.value}'s`);
        }
        return;
      }
    }
    
    socket.emit('placeBid', {
      gameId: game.gameId,
      playerId: game.playerId,
      count: game.bidCount,
      value: game.bidValue,
      isTsi: game.isTsi || game.bidValue === 1, // Always Tsi if value is 1
      isFly: game.isFly
    });
    
    // Reset bid controls to slightly higher than current bid
    game.isMyTurn = false;
    updateGameControls();
  });

  // Challenge bid
  document.getElementById('challengeBtn').addEventListener('click', () => {
    if (!game.isMyTurn) {
      return; // Silently ignore if not your turn
    }
    
    if (!game.currentBid) {
      alert('There is no bid to challenge yet!');
      return;
    }
    
    // Send appropriate event based on stakes
    if (game.stakes > 1) {
      socket.emit('open', {
        gameId: game.gameId,
        playerId: game.playerId
      });
    } else {
      socket.emit('challenge', {
        gameId: game.gameId,
        playerId: game.playerId
      });
    }
    
    game.isMyTurn = false;
    updateGameControls();
  });
});

// Helper functions for UI updates
function updateLobbyPlayerList() {
  const playerList = document.getElementById('lobbyPlayerList');
  playerList.innerHTML = '';
  
  game.players.forEach(player => {
    const playerItem = document.createElement('div');
    playerItem.className = 'player-item';
    playerItem.textContent = player.name + (player.id === game.playerId ? ' (You)' : '');
    playerList.appendChild(playerItem);
  });
  
  // Update start button based on player count
  document.getElementById('startGameBtn').disabled = game.players.length < 2;
}

function updateGameUI() {
  // Update dice display
  const diceContainer = document.getElementById('diceContainer');
  diceContainer.innerHTML = '';
  
  game.myDice.forEach(dieValue => {
    const dieElement = createDiceDots(dieValue, dieValue === 1);
    diceContainer.appendChild(dieElement);
  });
  
  // Update player list
  const playerList = document.getElementById('playerList');
  playerList.innerHTML = '';
  
  game.players.forEach((player, index) => {
    const playerItem = document.createElement('div');
    playerItem.className = `player-item ${index === game.currentPlayerIndex ? 'current-player' : ''}`;
    
    const playerScore = game.playerScores[player.id] || 0;
    const scoreText = playerScore >= 0 ? `+${playerScore}p` : `${playerScore}p`;
    const dollars = playerScore * game.baseStakeValue;
    const dollarText = dollars >= 0 ? `+${dollars}` : `-${Math.abs(dollars)}`;
    
    playerItem.textContent = `${player.name} ${scoreText} ${dollarText} ${player.id === game.playerId ? '(You)' : ''}`;
    playerList.appendChild(playerItem);
  });
  
  // Update game status text
  const gameStatus = document.getElementById('gameStatus');
  if (game.isMyTurn) {
    gameStatus.textContent = 'Your turn! Make a bid or call "Liar!"';
  } else if (game.currentPlayerIndex !== null) {
    const currentPlayerName = game.players[game.currentPlayerIndex]?.name || 'Unknown';
    gameStatus.textContent = `Waiting for ${currentPlayerName} to make a move...`;
  } else {
    gameStatus.textContent = 'Waiting for game to start...';
  }
  
  // Update current bid display
  updateCurrentBidDisplay();
  
  // Update stakes display
  updateStakesDisplay();
  
  // Update round indicator to include score
  const roundIndicator = document.getElementById('roundIndicator');
  const myScore = game.playerScores[game.playerId] || 0;
  const scoreDisplay = myScore >= 0 ? `+${myScore}p` : `${myScore}p`;
  const moneyDisplay = myScore >= 0 ? 
    `+${myScore * game.baseStakeValue}` : 
    `-${Math.abs(myScore * game.baseStakeValue)}`;

  document.getElementById('roundNumber').textContent = game.round;
  document.getElementById('scoreDisplay').textContent = scoreDisplay;
  document.getElementById('moneyDisplay').textContent = moneyDisplay;
  
  // Update control visibility based on turn
  updateGameControls();
  
  // Update bid history
  updateBidHistory();
}

function formatBidForDisplay(count, value, isTsi, isFly) {
  // Value 1 is always TSI
  if (value === 1) {
    isTsi = true;
  }
  
  const tsiSymbol = isTsi ? ' (-)' : '';
  const flySymbol = isFly ? ' (+)' : '';
  return `${count} ${value}'s${tsiSymbol}${flySymbol}`;
}

function updateCurrentBidDisplay() {
  const currentBidDisplay = document.getElementById('currentBidDisplay');
  const currentBidText = document.getElementById('currentBidText');
  
  if (game.currentBid) {
    const isTsi = game.currentBid.isTsi || game.currentBid.value === 1;
    currentBidText.textContent = formatBidForDisplay(
      game.currentBid.count,
      game.currentBid.value,
      isTsi,
      game.currentBid.isFly
    );
    currentBidDisplay.style.display = 'block';
  } else {
    currentBidText.textContent = 'None';
    currentBidDisplay.style.display = 'none';
  }
}

function updateStakesDisplay() {
  const stakesDisplay = document.getElementById('stakesDisplay');
  stakesDisplay.textContent = `Stakes: ${game.stakes} point${game.stakes > 1 ? 's' : ''} (${game.stakes * game.baseStakeValue})`;
}

function updateBidHistory() {
  const bidHistoryContainer = document.getElementById('bidHistory');
  bidHistoryContainer.innerHTML = '';
  
  if (game.bidHistory.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'history-item';
    emptyMessage.textContent = 'No bids yet';
    bidHistoryContainer.appendChild(emptyMessage);
    return;
  }
  
  // Show last 10 bids, most recent at the top
  game.bidHistory.slice(-10).reverse().forEach(bid => {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.textContent = `${bid.playerName}: ${formatBidForDisplay(
      bid.count,
      bid.value,
      bid.isTsi || bid.value === 1,
      bid.isFly
    )}`;
    bidHistoryContainer.appendChild(historyItem);
  });
}

function updateGameControls() {
  // Bid controls container
  const bidControls = document.getElementById('bidControls');
  
  // Show controls only for the player whose turn it is
  if (game.isMyTurn) {
    bidControls.style.display = 'block';
  } else {
    bidControls.style.display = 'none';
    return;
  }
  
  // Check if we're in Pi mode (responding to a Pi)
  const isInPiResponse = game.stakes > 1 && 
                         game.currentBid && 
                         game.currentBid.player !== game.playerId;
  
  // Regular bid elements
  const countBidElem = document.querySelector('.bid-selector:nth-of-type(1)');
  const valueBidElem = document.querySelector('.bid-selector:nth-of-type(2)');
  const bidTypeButtons = document.querySelector('.bid-type-buttons');
  
  // Regular bid buttons
  const bidBtn = document.getElementById('bidBtn');
  const challengeBtn = document.getElementById('challengeBtn');
  
  // Pi mode buttons
  const piBtn = document.getElementById('piBtn');
  const foldBtn = document.getElementById('foldBtn');
  const openBtn = document.getElementById('openBtn');
  
  // Determine Fly button availability (only after Tsi bid or bid with value 1)
  const flyButton = document.getElementById('flyBtn');
  const isFlyAvailable = game.currentBid && (game.currentBid.isTsi || game.currentBid.value === 1);
  flyButton.style.display = isFlyAvailable ? 'inline-block' : 'none';
  
  // Update challenge button - rename to "Open!" in Pi mode
  if (game.stakes > 1) {
    challengeBtn.textContent = 'Open!';
  } else {
    challengeBtn.textContent = 'Call Liar!';
  }
  
  // First bid of the game
  if (!game.currentBid) {
    // Regular bidding controls
    countBidElem.style.display = 'block';
    valueBidElem.style.display = 'block';
    bidTypeButtons.style.display = 'block';
    
    // Show only bid button
    bidBtn.style.display = 'block';
    challengeBtn.style.display = 'none';
    
    // Hide Pi mode controls
    piBtn.style.display = 'none';
    foldBtn.style.display = 'block';
    openBtn.style.display = 'none';
    
    return;
  }
  
  // Pi mode
  if (isInPiResponse) {
    // Hide regular bidding controls
    countBidElem.style.display = 'none';
    valueBidElem.style.display = 'none';
    bidTypeButtons.style.display = 'none';
    bidBtn.style.display = 'none';
    
    // Show challenge button as "Open!"
    challengeBtn.textContent = 'Open!';
    challengeBtn.style.display = 'block';
    
    // Show Pi mode controls
    const foldPenalty = Math.floor(game.stakes / 2);
    
    // Update Pi button label based on Pi count
    if (game.piCount < 3) {
      const piLabels = ["Pi (2x)", "Pi (4x)", "Pi (8x)"];
      piBtn.textContent = piLabels[game.piCount];
      piBtn.style.display = 'block';
    } else {
      piBtn.style.display = 'none';
    }
    
    // Show Fold with penalty amount - Always show after first Pi
    foldBtn.textContent = `Fold (-${foldPenalty}p)`;
    foldBtn.style.display = 'block'; // Always show fold button when stakes > 1
    
    // Show Open button
    openBtn.style.display = 'none'; // Use challengeBtn instead (renamed to "Open!")
  } 
  // Regular mode
  else {
    // Show regular bidding controls
    countBidElem.style.display = 'block';
    valueBidElem.style.display = 'block';
    bidTypeButtons.style.display = 'block';
    
    // Show regular action buttons
    bidBtn.style.display = 'block';
    challengeBtn.style.display = game.currentBid ? 'block' : 'none';
    
    // Show Pi button, hide fold/open
    piBtn.style.display = game.currentBid ? 'block' : 'none';
    foldBtn.style.display = 'none';
    openBtn.style.display = 'none';
    
    // Update Pi button label
    if (game.piCount < 3) {
      const piLabels = ["Pi (2x)", "Pi (4x)", "Pi (8x)"];
      piBtn.textContent = piLabels[game.piCount];
    } else {
      piBtn.style.display = 'none';
    }
  }
  
  // Update bid validity
  updateBidValidity();
}

// Socket.io event handlers
socket.on('gameCreated', ({ gameId, state }) => {
  game.gameId = gameId;
  updateGameState(state);
  
  // Display the game ID for sharing
  document.getElementById('gameIdDisplay').textContent = gameId;
  
  // Update lobby player list
  updateLobbyPlayerList();
  
  // Switch to lobby screen
  showScreen('lobby');
});

socket.on('gameJoined', ({ gameId, state, alreadyJoined }) => {
  game.gameId = gameId;
  updateGameState(state);
  
  // Update lobby player list
  updateLobbyPlayerList();
  
  // Show notification if we were already in the game
  if (alreadyJoined) {
    alert("You're already in this game!");
  }
  
  // Switch to lobby screen
  showScreen('lobby');
});

socket.on('playerJoined', ({ player, state }) => {
  updateGameState(state);
  updateLobbyPlayerList();
  
  // Optionally show a notification
  tgApp.HapticFeedback.notificationOccurred('success');
});

socket.on('playerLeft', ({ playerId, state }) => {
  updateGameState(state, false);
  
  if (screens.lobby.classList.contains('active')) {
    updateLobbyPlayerList();
  } else {
    updateGameUI();
  }
});

socket.on('error', ({ message }) => {
  alert(message);
});

socket.on('gameUpdate', ({ state }) => {
  // Update general game state (without dice)
  updateGameState(state, false);
  updateGameUI();
});

socket.on('bidPlaced', ({ player, bid, state, nextPlayerId }) => {
  // Add to bid history
  game.bidHistory.push({
    playerName: player.name,
    count: bid.count,
    value: bid.value,
    isTsi: bid.isTsi || bid.value === 1, // Track bids of 1s as TSI
    isFly: bid.isFly
  });
  
  // Update UI
  updateBidHistory();
  
  // Update current bid
  game.currentBid = bid;
  
  // Update current bid display
  updateCurrentBidDisplay();
  
  // Update general game state (without dice)
  updateGameState(state, false);
  
  // Explicitly check if it's my turn now
  game.isMyTurn = nextPlayerId === game.playerId;
  
  updateGameUI();
});

socket.on('challengeResult', ({ challenger, result, allDice, baseStakeValue, stakes }) => {
  // Show the round summary instead of challenge results
  const winnerName = result.winner.name;
  const loserName = result.loser.name;
  const actualCount = result.actualCount;
  const bidValue = result.bid.value;
  const bidCount = result.bid.count;
  const isTsi = result.bid.isTsi || result.bid.value === 1; // Consider value 1 as TSI
  const isFly = result.bid.isFly;
  
  // Format bid for display
  const bidDisplay = formatBidForDisplay(bidCount, bidValue, isTsi, isFly);
  
  // Calculate the points won/lost
  const points = stakes || 1;
  const dollars = points * (baseStakeValue || 100);
  
  // Determine if I won or lost
  const isWinner = result.winner.id === game.playerId;
  const isLoser = result.loser.id === game.playerId;
  
  // Set round summary text
  document.getElementById('roundSummaryText').innerHTML = `
    <h3>Round ${game.round} Results</h3>
    <p><strong>${challenger.name}</strong> challenged!</p>
    <p>Bid: ${bidDisplay}</p>
    <p>Actual count: ${actualCount} ${bidValue}'s</p>
    <p><strong>${winnerName}</strong> wins, <strong>${loserName}</strong> loses.</p>
    <p>Points: ${isWinner ? '+' : '-'}${points} (${isWinner ? '+' : '-'}${dollars})</p>
  `;
  
  // Show all dice
  const diceReveal = document.getElementById('summaryDiceReveal');
  diceReveal.innerHTML = '';
  
  for (const playerId in allDice) {
    const playerName = game.players.find(p => p.id === playerId)?.name || 'Unknown';
    const playerDice = allDice[playerId];
    
    const playerDiceElem = document.createElement('div');
    playerDiceElem.className = 'player-dice';
    
    // Create header for player name
    const playerNameElem = document.createElement('h4');
    playerNameElem.textContent = playerName;
    playerDiceElem.appendChild(playerNameElem);
    
    // Create dice container
    const diceContainer = document.createElement('div');
    diceContainer.className = 'dice-container';
    
    // Add each die
    playerDice.forEach(value => {
      const dieElem = createDiceDots(value, value === 1);
      diceContainer.appendChild(dieElem);
    });
    
    playerDiceElem.appendChild(diceContainer);
    diceReveal.appendChild(playerDiceElem);
  }
  
  // Only show next round and end game buttons for loser
  document.getElementById('nextRoundBtn').style.display = isLoser ? 'block' : 'none';
  document.getElementById('endGameBtn').style.display = isLoser ? 'block' : 'none';
  
  // Show message to wait for loser to decide if you're not the loser
  if (!isLoser) {
    document.getElementById('roundSummaryText').innerHTML += `
      <p class="waiting-message">Waiting for ${loserName} to decide whether to continue...</p>
    `;
  }
  
  // Show the round summary screen
  showScreen('roundSummary');
});

socket.on('foldResult', ({ loser, winner, penalty, state, baseStakeValue }) => {
  // Calculate dollars
  const dollars = penalty * (baseStakeValue || 100);
  
  // Determine if I won or lost
  const isWinner = winner.id === game.playerId;
  const isLoser = loser.id === game.playerId;
  
  // Set round summary text
  document.getElementById('roundSummaryText').innerHTML = `
    <h3>Round ${game.round} Results</h3>
    <p><strong>${loser.name}</strong> folded!</p>
    <p><strong>${winner.name}</strong> wins ${penalty} points (${dollars})</p>
    <p>Points: ${isWinner ? '+' : '-'}${penalty} (${isWinner ? '+' : '-'}${dollars})</p>
  `;
  
  // No dice to show for fold
  document.getElementById('summaryDiceReveal').innerHTML = '';
  
  // Only show next round and end game buttons for loser
  document.getElementById('nextRoundBtn').style.display = isLoser ? 'block' : 'none';
  document.getElementById('endGameBtn').style.display = isLoser ? 'block' : 'none';
  
  // Show message to wait for loser to decide if you're not the loser
  if (!isLoser) {
    document.getElementById('roundSummaryText').innerHTML += `
      <p class="waiting-message">Waiting for ${loser.name} to decide whether to continue...</p>
    `;
  }
  
  // Update game state
  updateGameState(state);
  
  // Show the round summary screen
  showScreen('roundSummary');
});

socket.on('roundStarted', ({ state, playerId, round }) => {
  // Only update if this event is for me
  if (playerId === game.playerId) {
    updateGameState(state);
    
    // Update round number
    document.getElementById('roundNumber').textContent = round;
    
    // Reset bid history
    game.bidHistory = [];
    
    // Reset current bid
    game.currentBid = null;
    
    // Reset stakes
    game.stakes = 1;
    game.piCount = 0;
    
    // Reset bid options
    game.isTsi = false;
    game.isFly = false;
    document.getElementById('tsiBtn').classList.remove('selected');
    document.getElementById('flyBtn').classList.remove('selected');
    
    updateCurrentBidDisplay();
    updateStakesDisplay();
    
    // Update bid buttons
    updateBidValidity();
    
    updateBidHistory();
    updateGameUI();
    showScreen('game');
  }
});

socket.on('gameStarted', ({ state, playerId }) => {
  // Only update if this event is for me
  if (playerId === game.playerId) {
    updateGameState(state);
    
    // Calculate max count based on number of players
    game.maxCount = state.players.length * 5; // 5 dice per player
    
    // Initialize bid buttons
    initializeBidButtons();
    
    updateGameUI();
    showScreen('game');
  }
});

socket.on('piCalled', ({ player, newStakes, piCount, state }) => {
  game.stakes = newStakes;
  game.piCount = piCount || state.piCount;
  
  // Update game state
  updateGameState(state, false);
  
  // Handle turn correctly
  const isMyTurn = state.currentPlayerIndex !== null && 
                  state.players[state.currentPlayerIndex].id === game.playerId;
  
  game.isMyTurn = isMyTurn;
  
  updateGameUI();
  
  // Show notification
  const piMessage = document.createElement('div');
  piMessage.className = 'history-item';
  piMessage.innerHTML = `<strong>${player.name}</strong> doubled stakes to ${newStakes} points!`;
  document.getElementById('bidHistory').prepend(piMessage);
});

socket.on('yourTurn', ({ state, playerId }) => {
  // Only update if this event is for me
  if (playerId === game.playerId) {
    updateGameState(state);
    game.isMyTurn = true;
    updateGameUI();
    
    // Reset tsi/fly selection ONLY if not in TSI mode already (value 1 bid)
    if (!game.currentBid || (game.currentBid && game.currentBid.value !== 1 && !game.currentBid.isTsi)) {
      game.isTsi = false;
      game.isFly = false;
      document.getElementById('tsiBtn').classList.remove('selected');
      document.getElementById('flyBtn').classList.remove('selected');
    }
    
    // Haptic feedback for turn
    tgApp.HapticFeedback.notificationOccurred('success');
  }
});

socket.on('gameEnded', ({ state, leaderboard, endedBy }) => {
  game.gameEnded = true;
  game.endedBy = endedBy;
  
  // Display leaderboard
  const leaderboardElem = document.getElementById('leaderboardDisplay');
  leaderboardElem.innerHTML = '<h3>Game Leaderboard</h3>';
  
  const leaderTable = document.createElement('table');
  leaderTable.className = 'leaderboard-table';
  
  // Create table header
  const header = document.createElement('tr');
  header.innerHTML = `
    <th>Player</th>
    <th>Points</th>
    <th>Money</th>
    <th>W/L</th>
  `;
  leaderTable.appendChild(header);
  
  // Add each player
  leaderboard.forEach(player => {
    const row = document.createElement('tr');
    const dollars = player.points * (state.baseStakeValue || 100);
    const dollarsDisplay = dollars >= 0 ? `+${dollars}` : `-${Math.abs(dollars)}`;
    
    row.innerHTML = `
      <td>${player.name}${player.id === game.playerId ? ' (You)' : ''}</td>
      <td>${player.points > 0 ? '+' : ''}${player.points}</td>
      <td>${dollarsDisplay}</td>
      <td>${player.wins}W/${player.losses}L</td>
    `;
    leaderTable.appendChild(row);
  });
  
  leaderboardElem.appendChild(leaderTable);
  
  // Show different message based on who ended the game and if it was you
  const gameEndText = document.getElementById('gameEndText');
  const endedByName = game.players.find(p => p.id === endedBy)?.name || 'Unknown';
  
  if (endedBy === game.playerId) {
    gameEndText.innerHTML = `
      <p>You ended the game. Thanks for playing!</p>
      <p>A full leaderboard has been posted to the group chat.</p>
    `;
  } else {
    gameEndText.innerHTML = `
      <p>${endedByName} ended the game. Thanks for playing!</p>
      <p>A full leaderboard has been posted to the group chat.</p>
    `;
  }
  
  // Show game end screen
  showScreen('gameEnd');

  // Initialize the game interface once DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
  // Check for game join parameter
  checkForGameJoin();
  
  // Initialize event listeners for all buttons
  initializeEventListeners();
});

// Move all button event listeners to this function
function initializeEventListeners() {
  // All your button event listeners go here
  document.getElementById('createGameBtn').addEventListener('click', ...);
  document.getElementById('joinGameBtn').addEventListener('click', ...);
  // etc.
}