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
  players: [],     // Players in the game
  gameEnder: null  // Track who ended the game
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
    const dot1 = document.createElement('div');
    dot1.className = 'dice-dot';
    dot1.style.position = 'absolute';
    dot1.style.top = '50%';
    dot1.style.left = '50%';
    dot1.style.transform = 'translate(-50%, -50%)';
    diceElem.appendChild(dot1);
    
    const dot2 = document.createElement('div');
    dot2.className = 'dice-dot';
    dot2.style.position = 'absolute';
    dot2.style.top = '25%';
    dot2.style.left = '25%';
    diceElem.appendChild(dot2);
    
    const dot3 = document.createElement('div');
    dot3.className = 'dice-dot';
    dot3.style.position = 'absolute';
    dot3.style.bottom = '25%';
    dot3.style.right = '25%';
    diceElem.appendChild(dot3);
  }
  // For 4 (in all corners)
  else if (value === 4) {
    const dot1 = document.createElement('div');
    dot1.className = 'dice-dot';
    dot1.style.position = 'absolute';
    dot1.style.top = '25%';
    dot1.style.left = '25%';
    diceElem.appendChild(dot1);
    
    const dot2 = document.createElement('div');
    dot2.className = 'dice-dot';
    dot2.style.position = 'absolute';
    dot2.style.top = '25%';
    dot2.style.right = '25%';
    diceElem.appendChild(dot2);
    
    const dot3 = document.createElement('div');
    dot3.className = 'dice-dot';
    dot3.style.position = 'absolute';
    dot3.style.bottom = '25%';
    dot3.style.left = '25%';
    diceElem.appendChild(dot3);
    
    const dot4 = document.createElement('div');
    dot4.className = 'dice-dot';
    dot4.style.position = 'absolute';
    dot4.style.bottom = '25%';
    dot4.style.right = '25%';
    diceElem.appendChild(dot4);
  }
  // For 5 (4 + center)
  else if (value === 5) {
    const dot1 = document.createElement('div');
    dot1.className = 'dice-dot';
    dot1.style.position = 'absolute';
    dot1.style.top = '50%';
    dot1.style.left = '50%';
    dot1.style.transform = 'translate(-50%, -50%)';
    diceElem.appendChild(dot1);
    
    const dot2 = document.createElement('div');
    dot2.className = 'dice-dot';
    dot2.style.position = 'absolute';
    dot2.style.top = '25%';
    dot2.style.left = '25%';
    diceElem.appendChild(dot2);
    
    const dot3 = document.createElement('div');
    dot3.className = 'dice-dot';
    dot3.style.position = 'absolute';
    dot3.style.top = '25%';
    dot3.style.right = '25%';
    diceElem.appendChild(dot3);
    
    const dot4 = document.createElement('div');
    dot4.className = 'dice-dot';
    dot4.style.position = 'absolute';
    dot4.style.bottom = '25%';
    dot4.style.left = '25%';
    diceElem.appendChild(dot4);
    
    const dot5 = document.createElement('div');
    dot5.className = 'dice-dot';
    dot5.style.position = 'absolute';
    dot5.style.bottom = '25%';
    dot5.style.right = '25%';
    diceElem.appendChild(dot5);
  }
  // For 6 (like 4 but with middle row added)
  else if (value === 6) {
    const dot1 = document.createElement('div');
    dot1.className = 'dice-dot';
    dot1.style.position = 'absolute';
    dot1.style.top = '25%';
    dot1.style.left = '25%';
    diceElem.appendChild(dot1);
    
    const dot2 = document.createElement('div');
    dot2.className = 'dice-dot';
    dot2.style.position = 'absolute';
    dot2.style.top = '25%';
    dot2.style.right = '25%';
    diceElem.appendChild(dot2);
    
    const dot3 = document.createElement('div');
    dot3.className = 'dice-dot';
    dot3.style.position = 'absolute';
    dot3.style.top = '50%';
    dot3.style.left = '25%';
    dot3.style.transform = 'translateY(-50%)';
    diceElem.appendChild(dot3);
    
    const dot4 = document.createElement('div');
    dot4.className = 'dice-dot';
    dot4.style.position = 'absolute';
    dot4.style.top = '50%';
    dot4.style.right = '25%';
    dot4.style.transform = 'translateY(-50%)';
    diceElem.appendChild(dot4);
    
    const dot5 = document.createElement('div');
    dot5.className = 'dice-dot';
    dot5.style.position = 'absolute';
    dot5.style.bottom = '25%';
    dot5.style.left = '25%';
    diceElem.appendChild(dot5);
    
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
    });
    valueButtons.appendChild(button);
  }
  
  // Set initial bid to meet minimum requirements (3 of any value or 2 of value 1)
  game.bidCount = 3;
  game.bidValue = 2;
  
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
  
  // Force TSI for value 1, but only toggle UI if not already set
  if (value === 1 && !game.isTsi) {
    game.isTsi = true;
    document.getElementById('tsiBtn').classList.add('selected');
  }
  
  const valueButtons = document.querySelectorAll('#valueButtons .number-button');
  valueButtons.forEach(button => {
    button.classList.toggle('selected', parseInt(button.dataset.value) === value);
  });
  
  updateBidValidity();
}

function updateBidValidity() {
  const countButtons = document.querySelectorAll('#countButtons .number-button');
  const valueButtons = document.querySelectorAll('#valueButtons .number-button');
  
  countButtons.forEach(button => button.style.display = 'flex');
  valueButtons.forEach(button => button.style.display = 'flex');
  
  if (game.currentBid) {
    if (game.currentBid.value === 1) {
      const minCount = game.currentBid.count + 1;
      countButtons.forEach(button => {
        if (parseInt(button.dataset.count) < minCount) button.style.display = 'none';
      });
      if (game.bidCount < minCount) selectCount(minCount);
      return;
    }
    
    if (game.currentBid.isTsi && !game.currentBid.isFly) {
      if (game.isTsi) {
        if (game.currentBid.isTsi) {
          countButtons.forEach(button => {
            const count = parseInt(button.dataset.count);
            if (!(count > game.currentBid.count || count === game.currentBid.count)) button.style.display = 'none';
          });
          valueButtons.forEach(button => {
            const value = parseInt(button.dataset.value);
            if (game.bidCount === game.currentBid.count && value <= game.currentBid.value) button.style.display = 'none';
          });
        } else {
          countButtons.forEach(button => {
            if (parseInt(button.dataset.count) < game.currentBid.count) button.style.display = 'none';
          });
          valueButtons.forEach(button => button.style.display = 'flex');
        }
      } else if (game.isFly) {
        const minCount = game.currentBid.count * 2;
        countButtons.forEach(button => {
          if (parseInt(button.dataset.count) < minCount) button.style.display = 'none';
        });
        if (game.bidCount < minCount) selectCount(minCount);
        valueButtons.forEach(button => button.style.display = 'flex');
      } else {
        countButtons.forEach(button => button.style.display = 'none');
        valueButtons.forEach(button => button.style.display = 'none');
      }
    } else {
      countButtons.forEach(button => {
        const count = parseInt(button.dataset.count);
        if (!(count > game.currentBid.count || count === game.currentBid.count)) button.style.display = 'none';
      });
      if (!game.isTsi) { // Regular bid: must increase value if count is same
        valueButtons.forEach(button => {
          const value = parseInt(button.dataset.value);
          if (game.bidCount === game.currentBid.count && value <= game.currentBid.value) button.style.display = 'none';
        });
      } // TSI bid: allow any value if count is same or higher
    }
  } else {
    countButtons.forEach(button => {
      const count = parseInt(button.dataset.count);
      if (count < 3 && game.bidValue !== 1) button.style.display = 'none';
      else if (count < 2) button.style.display = 'none';
    });
    
    if (game.bidCount < 3 && game.bidValue !== 1) selectCount(3);
    else if (game.bidCount < 2) selectCount(2);
    
    document.getElementById('tsiBtn').disabled = false;
  }
}

    // Ensure initial selection meets minimum requirements
    if (game.bidCount < 3 && game.bidValue !== 1) {
      selectCount(3);
    } else if (game.bidCount < 2) {
      selectCount(2);
    }
    
    // Reset TSI button state for new round unless bidding 1s
    if (game.bidValue !== 1) {
      game.isTsi = false;
      document.getElementById('tsiBtn').classList.remove('selected');
      document.getElementById('tsiBtn').disabled = false;
    }
  

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
  if (!game.isMyTurn) return;
  
  if (game.bidValue === 1) {
    game.isTsi = true;
    document.getElementById('tsiBtn').classList.add('selected');
    return;
  }
  
  game.isTsi = !game.isTsi;
  game.isFly = false;
  document.getElementById('tsiBtn').classList.toggle('selected', game.isTsi);
  document.getElementById('flyBtn').classList.remove('selected');
  updateBidValidity();
});

document.getElementById('flyBtn').addEventListener('click', () => {
  if (!game.isMyTurn) return;
  if (!game.currentBid || !game.currentBid.isTsi || game.currentBid.isFly) return;
  
  game.isFly = !game.isFly;
  game.isTsi = false;
  document.getElementById('flyBtn').classList.toggle('selected', game.isFly);
  document.getElementById('tsiBtn').classList.remove('selected');
  
  if (game.isFly) {
    const minCount = game.currentBid.count * 2;
    if (game.bidCount < minCount) selectCount(minCount);
  }
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
  
  // Record who ended the game
  game.gameEnder = game.playerId;
});

// Return to home screen
document.getElementById('returnHomeBtn').addEventListener('click', () => {
  window.location.href = '/'; // Reload the page to start fresh
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
  socket.emit('leaveGame', { gameId: game.gameId, playerId: game.playerId });
  // Wait for server to emit 'gameEnded' or 'foldResult' followed by 'gameEnded'
});

// Place bid
document.getElementById('bidBtn').addEventListener('click', () => {
  if (!game.isMyTurn) return;
  
  if (game.bidValue === 1 && !game.isTsi) {
    game.isTsi = true;
    document.getElementById('tsiBtn').classList.add('selected');
  }
  
  if (game.currentBid) {
    let isValidBid = false;
    
    if (game.currentBid.isTsi && !game.currentBid.isFly) {
      if (!game.isTsi && !game.isFly) return alert('After a Tsi (-) bid, you must choose Tsi (-) or Fly (+)!');
      if (game.isTsi) {
        isValidBid = (game.bidCount > game.currentBid.count) || 
                     (game.bidCount === game.currentBid.count && game.bidValue > game.currentBid.value);
      } else if (game.isFly) {
        const minCount = game.currentBid.count * 2;
        isValidBid = game.bidCount >= minCount;
        if (!isValidBid) return alert(`Fly bid must double count to at least ${minCount}!`);
      }
    } else {
      if (game.isTsi) {
        isValidBid = game.bidCount >= game.currentBid.count; // Allow same count, any value for TSI
      } else {
        isValidBid = (game.bidCount > game.currentBid.count) || 
                     (game.bidCount === game.currentBid.count && game.bidValue > game.currentBid.value);
      }
    }
    
    if (!isValidBid) {
      if (game.isTsi) return alert(`Tsi bid must be at least ${game.currentBid.count} dice!`);
      if (game.isFly) return alert(`Fly bid must double count to at least ${game.currentBid.count * 2}!`);
      return alert(`Your bid must be higher than ${game.currentBid.count} ${game.currentBid.value}'s`);
    }
  } else {
    if (game.bidCount < 3 && game.bidValue !== 1) return alert('First bid must be at least 3 of any dice value!');
    if (game.bidCount < 2) return alert('First bid must be at least 2 dice!');
  }
  
  socket.emit('placeBid', { gameId: game.gameId, playerId: game.playerId, count: game.bidCount, value: game.bidValue, isTsi: game.isTsi, isFly: game.isFly });
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

socket.on('gameUpdate', ({ state }) => {
  // Update general game state (without dice)
  updateGameState(state, false);
  updateGameUI();
});

socket.on('bidPlaced', ({ player, bid, state, nextPlayerId }) => {
  game.bidHistory.push({ playerName: player.name, count: bid.count, value: bid.value, isTsi: bid.isTsi, isFly: bid.isFly });
  updateBidHistory();
  game.currentBid = bid;
  updateCurrentBidDisplay();
  updateGameState(state, false);
  game.isMyTurn = nextPlayerId === game.playerId;
  
  if (bid.isFly) {
    game.isTsi = false;
    game.isFly = false;
    document.getElementById('tsiBtn').classList.remove('selected');
    document.getElementById('flyBtn').classList.remove('selected');
  } else if (game.isMyTurn && bid.value !== 1) {
    game.isTsi = false;
    game.isFly = false;
    document.getElementById('tsiBtn').classList.remove('selected');
    document.getElementById('flyBtn').classList.remove('selected');
  }
  
  updateGameUI();
});

socket.on('piCalled', ({ player, newStakes, piCount, state }) => {
  game.stakes = newStakes;
  game.piCount = piCount || state.piCount;
  
  // Update game state
  updateGameState(state, false);
  
  // Handle turn correctly - force update based on state
  game.isMyTurn = state.currentPlayerIndex !== null && 
                 state.players[state.currentPlayerIndex].id === game.playerId;
  
  // Force UI refresh to ensure correct buttons are shown
  updateGameUI();
  
  // Show notification
  const piMessage = document.createElement('div');
  piMessage.className = 'history-item';
  piMessage.innerHTML = `<strong>${player.name}</strong> doubled stakes to ${newStakes} points!`;
  document.getElementById('bidHistory').prepend(piMessage);
});

socket.on('yourTurn', ({ state, playerId }) => {
  if (playerId === game.playerId) {
    updateGameState(state);
    game.isMyTurn = true;
    updateGameUI();
    
    if (!game.currentBid || game.currentBid.isFly || (game.currentBid.value !== 1 && !game.currentBid.isTsi)) {
      game.isTsi = false;
      game.isFly = false;
      document.getElementById('tsiBtn').classList.remove('selected');
      document.getElementById('flyBtn').classList.remove('selected');
      document.getElementById('tsiBtn').disabled = false;
    }
    tgApp.HapticFeedback.notificationOccurred('success');
  }
});

socket.on('challengeResult', ({ challenger, result, allDice, baseStakeValue, stakes }) => {
  // Show the round summary instead of challenge results
  const winnerName = result.winner.name;
  const loserName = result.loser.name;
  const actualCount = result.actualCount;
  const bidValue = result.bid.value;
  const bidCount = result.bid.count;
  const isTsi = result.bid.isTsi;
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
    <p>Points: ${isWinner ? '+' : '-'}${points} (${isWinner ? '+' : '-'}$${dollars})</p>
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
    <p><strong>${winner.name}</strong> wins ${penalty} points ($${dollars})</p>
    <p>Points: ${isWinner ? '+' : '-'}${penalty} (${isWinner ? '+' : '-'}$${dollars})</p>
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
    document.getElementById('tsiBtn').disabled = false;
    
    updateCurrentBidDisplay();
    updateStakesDisplay();
    
    // Update bid buttons - initialize with minimum bid requirements
    initializeBidButtons();
    
    updateBidHistory();
    updateGameUI();
    showScreen('game');
  }
});

socket.on('gameEnded', ({ state, leaderboard, endedBy }) => {
  // Store who ended the game
  game.gameEnder = endedBy || game.gameEnder;
  
  // Get the player object directly from the list of players in our game state
  let enderPlayer = null;
  
  // Search for the player who ended the game
  for (const player of game.players) {
    // Check player id against socket.id (which is what endedBy contains) or against game.gameEnder
    if (player.id === game.gameEnder || player.id === endedBy) {
      enderPlayer = player;
      break;
    }
  }
  
  // Find the name of the player who ended the game, with better fallback
  const enderName = enderPlayer ? enderPlayer.name : (
    game.players.find(p => p.id === game.gameEnder || p.id === endedBy)?.name || 
    game.players.find(p => p.id === socket.id)?.name || 
    'Someone'
  );
  
  // Log who ended the game for debugging
  console.log('Game ended by:', { 
    endedBy, 
    gameEnder: game.gameEnder, 
    enderName, 
    players: game.players.map(p => ({id: p.id, name: p.name}))
  });
  
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
    `;
    leaderTable.appendChild(row);
  });
  
  leaderboardElem.appendChild(leaderTable);
  
  // Show appropriate message based on who ended the game
  let gameEndMessage;
  if (game.gameEnder === game.playerId) {
    gameEndMessage = `You ended the game.`;
  } else {
    gameEndMessage = `${enderName} was a chicken and left the game.`;
  }
  
  // Show goodbye message
  document.getElementById('gameEndText').innerHTML = `
    <p>${gameEndMessage}</p>
    <p>A full leaderboard has been posted to the group chat.</p>
  `;
  
  // Add a close app button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'button';
  closeBtn.textContent = 'Close App';
  closeBtn.addEventListener('click', () => {
    tgApp.close();
  });
  
  document.getElementById('gameEndText').appendChild(closeBtn);
  
  // Show game end screen
  showScreen('gameEnd');
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

// Helper functions
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
  
  // Check if it's my turn
  if (game.currentPlayerIndex !== null) {
    const currentPlayerId = game.players[game.currentPlayerIndex]?.id;
    game.isMyTurn = currentPlayerId === game.playerId;
  } else {
    game.isMyTurn = false;
  }
}

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
    const dollarText = dollars >= 0 ? `+$${dollars}` : `-$${Math.abs(dollars)}`;
    
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
    `+$${myScore * game.baseStakeValue}` : 
    `-$${Math.abs(myScore * game.baseStakeValue)}`;

  document.getElementById('roundNumber').textContent = game.round;
  roundIndicator.innerHTML = `Round: <span id="roundNumber">${game.round}</span>&nbsp;&nbsp;|&nbsp;&nbsp;${scoreDisplay}&nbsp;&nbsp;|&nbsp;&nbsp;${moneyDisplay}`;
  
  // Update control visibility based on turn
  updateGameControls();
  
  // Update bid history
  updateBidHistory();
}

function formatBidForDisplay(count, value, isTsi, isFly) {
  const tsiSymbol = isTsi ? ' (-)' : '';
  const flySymbol = isFly ? ' (+)' : '';
  return `${count} ${value}'s${tsiSymbol}${flySymbol}`;
}

function updateCurrentBidDisplay() {
  const currentBidDisplay = document.getElementById('currentBidDisplay');
  const currentBidText = document.getElementById('currentBidText');
  
  if (game.currentBid) {
    currentBidText.textContent = formatBidForDisplay(
      game.currentBid.count,
      game.currentBid.value,
      game.currentBid.isTsi,
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
  stakesDisplay.textContent = `Stakes: ${game.stakes} point${game.stakes > 1 ? 's' : ''} ($${game.stakes * game.baseStakeValue})`;
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
      bid.isTsi,
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
  
  // FIX FOR BUG 2: Proper handling of Pi response mode
  const isInPiResponse = game.stakes > 1 && 
                        game.currentBid && 
                        game.isMyTurn;
  
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
  
  // Determine FLY button availability (only after Tsi bid)
  const flyButton = document.getElementById('flyBtn');
  const isFlyAvailable = game.currentBid && game.currentBid.isTsi && !game.currentBid.isFly;
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
    foldBtn.style.display = 'none';
    openBtn.style.display = 'none';
    
    return;
  }
  
  // FIX FOR BUG 2: Proper handling of Pi response mode
  if (isInPiResponse) {
    // Hide regular bidding controls
    countBidElem.style.display = 'none';
    valueBidElem.style.display = 'none';
    bidTypeButtons.style.display = 'none';
    
    // Hide the regular bid button in Pi response mode
    bidBtn.style.display = 'none';
    
    // Hide the regular challenge button since we're showing Open
    challengeBtn.style.display = 'none';
    
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
    
    // Always show Fold button with penalty amount
    foldBtn.textContent = `Fold (-${foldPenalty}p)`;
    foldBtn.style.display = 'block';
    
    // Show Open button
    openBtn.style.display = 'block';
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

// Apply Telegram theme if available
if (tgApp.colorScheme === 'dark') {
  document.documentElement.style.setProperty('--tg-theme-bg-color', '#212121');
  document.documentElement.style.setProperty('--tg-theme-text-color', '#ffffff');
  document.documentElement.style.setProperty('--tg-theme-hint-color', '#aaaaaa');
  document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', '#2c2c2c');
}

// Handle theme changes from Telegram
tgApp.onEvent('themeChanged', () => {
  if (tgApp.colorScheme === 'dark') {
    document.documentElement.style.setProperty('--tg-theme-bg-color', '#212121');
    document.documentElement.style.setProperty('--tg-theme-text-color', '#ffffff');
    document.documentElement.style.setProperty('--tg-theme-hint-color', '#aaaaaa');
    document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', '#2c2c2c');
  } else {
    document.documentElement.style.setProperty('--tg-theme-bg-color', '#ffffff');
    document.documentElement.style.setProperty('--tg-theme-text-color', '#000000');
    document.documentElement.style.setProperty('--tg-theme-hint-color', '#999999');
    document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', '#f1f1f1');
  }
});

// Check for game join parameter when the page loads
window.addEventListener('load', checkForGameJoin);