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

if (tgApp.initDataUnsafe && tgApp.initDataUnsafe.user) {
  const user = tgApp.initDataUnsafe.user;
  userData = {
    id: 'tg_' + user.id.toString(),
    name: user.first_name || (user.username ? '@' + user.username : 'Player')
  };
  console.log('Telegram user data loaded:', userData);
} else {
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
  maxCount: 30,
  isTsi: false,
  isFly: false,
  piCount: 0,
  stakes: 1,
  baseStakeValue: 100,
  playerScores: {},
  selectedStake: 100,
  roundHistory: [],
  players: [],
  gameEnder: null
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
  const chatId = urlParams.get('chatId');
  const stake = urlParams.get('stake');
  
  if (gameIdToJoin) {
    document.getElementById('gameIdInput').value = gameIdToJoin;
    if (chatId) {
      game.originChatId = chatId;
    }
    if (stake) {
      game.selectedStake = parseInt(stake);
      game.baseStakeValue = parseInt(stake);
      document.querySelector(`.stake-button[data-stake="${stake}"]`).classList.add('selected');
      document.querySelectorAll('.stake-button').forEach(btn => {
        if (btn.dataset.stake !== stake) btn.classList.remove('selected');
      });
    }
    setTimeout(() => {
      document.getElementById('joinGameBtn').click();
    }, 500);
  }

  const joinGameCookie = getCookie('joinGame');
  if (joinGameCookie) {
    document.getElementById('gameIdInput').value = joinGameCookie;
    setTimeout(() => {
      document.getElementById('joinGameBtn').click();
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

// Helper function to create dice dots pattern (unchanged)
function createDiceDots(value, isJoker) {
  const diceElem = document.createElement('div');
  diceElem.className = `dice ${isJoker ? 'joker' : ''}`;
  
  if (value === 1) {
    const dot = document.createElement('div');
    dot.className = 'dice-dot';
    dot.style.position = 'absolute';
    dot.style.top = '50%';
    dot.style.left = '50%';
    dot.style.transform = 'translate(-50%, -50%)';
    diceElem.appendChild(dot);
  } else if (value === 2) {
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
  } else if (value === 3) {
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
  } else if (value === 4) {
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
  } else if (value === 5) {
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
  } else if (value === 6) {
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

// Initialize bid buttons for bid selection (unchanged)
function initializeBidButtons() {
  const countButtons = document.getElementById('countButtons');
  const valueButtons = document.getElementById('valueButtons');
  
  countButtons.innerHTML = '';
  valueButtons.innerHTML = '';
  
  game.maxCount = Math.min(game.players.length, 6) * 5;
  
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
  
  for (let i = 1; i <= 6; i++) {
    const button = document.createElement('button');
    button.className = 'number-button dice-value-button';
    button.dataset.value = i;
    
    const miniDice = createDiceDots(i, i === 1);
    miniDice.style.width = '30px';
    miniDice.style.height = '30px';
    button.appendChild(miniDice);
    
    button.addEventListener('click', () => {
      selectValue(i);
    });
    valueButtons.appendChild(button);
  }
  
  game.bidCount = 3;
  game.bidValue = 2;
  
  selectCount(game.bidCount);
  selectValue(game.bidValue);
  
  updateBidValidity();
}

function selectCount(count) {
  game.bidCount = count;
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
    const valueHierarchy = (val) => val === 1 ? 7 : val; // 1s are highest
    
    if (game.currentBid.isTsi && !game.currentBid.isFly) {
      if (game.isTsi) {
        countButtons.forEach(button => {
          const count = parseInt(button.dataset.count);
          if (count < game.currentBid.count) button.style.display = 'none';
        });
        valueButtons.forEach(button => {
          const value = parseInt(button.dataset.value);
          if (game.bidCount === game.currentBid.count && valueHierarchy(value) <= valueHierarchy(game.currentBid.value)) {
            button.style.display = 'none';
          }
        });
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
        if (count < game.currentBid.count) button.style.display = 'none';
      });
      valueButtons.forEach(button => {
        const value = parseInt(button.dataset.value);
        if (game.bidCount === game.currentBid.count && valueHierarchy(value) <= valueHierarchy(game.currentBid.value)) {
          button.style.display = 'none';
        }
      });
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
function updateBidValidity() {
  const countButtons = document.querySelectorAll('#countButtons .number-button');
  const valueButtons = document.querySelectorAll('#valueButtons .number-button');
  
  countButtons.forEach(button => button.style.display = 'flex');
  valueButtons.forEach(button => button.style.display = 'flex');
  
  if (game.currentBid) {
    const valueHierarchy = (val) => val === 1 ? 7 : val;
    
    if (game.currentBid.isTsi && !game.currentBid.isFly) {
      if (game.isTsi) {
        countButtons.forEach(button => {
          const count = parseInt(button.dataset.count);
          if (count < game.currentBid.count) button.style.display = 'none';
        });
        valueButtons.forEach(button => {
          const value = parseInt(button.dataset.value);
          if (game.bidCount === game.currentBid.count && valueHierarchy(value) <= valueHierarchy(game.currentBid.value)) {
            button.style.display = 'none';
          }
        });
      } else if (game.isFly) {
        const minCount = game.currentBid.count * 2;
        countButtons.forEach(button => {
          if (parseInt(button.dataset.count) < minCount) button.style.display = 'none';
        });
        if (game.bidCount < minCount) selectCount(minCount);
        valueButtons.forEach(button => button.style.display = 'flex');
      } else {
        // After TSI, allow bidding by keeping options visible
        countButtons.forEach(button => {
          const count = parseInt(button.dataset.count);
          if (count < game.currentBid.count) button.style.display = 'none';
        });
        valueButtons.forEach(button => {
          const value = parseInt(button.dataset.value);
          if (game.bidCount === game.currentBid.count && valueHierarchy(value) <= valueHierarchy(game.currentBid.value)) {
            button.style.display = 'none';
          }
        });
      }
    } else {
      countButtons.forEach(button => {
        const count = parseInt(button.dataset.count);
        if (count < game.currentBid.count) button.style.display = 'none';
      });
      valueButtons.forEach(button => {
        const value = parseInt(button.dataset.value);
        if (game.bidCount === game.currentBid.count && valueHierarchy(value) <= valueHierarchy(game.currentBid.value)) {
          button.style.display = 'none';
        }
      });
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

// Event listeners (unchanged except endGameBtn)
document.querySelectorAll('.stake-button').forEach(button => {
  button.addEventListener('click', () => {
    const stake = parseInt(button.dataset.stake);
    game.selectedStake = stake;
    document.querySelectorAll('.stake-button').forEach(btn => {
      btn.classList.remove('selected');
    });
    button.classList.add('selected');
  });
});

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

document.getElementById('piBtn').addEventListener('click', () => {
  if (!game.isMyTurn) return;
  if (!game.currentBid) {
    alert('No bid to raise stakes on!');
    return;
  }
  if (game.piCount >= 3) {
    alert('Maximum Pi calls reached (8 points)! Use Fold or Open.');
    return;
  }
  socket.emit('pi', { gameId: game.gameId, playerId: game.playerId });
  game.isMyTurn = false;
  updateGameControls();
});

document.getElementById('foldBtn').addEventListener('click', () => {
  if (!game.isMyTurn) return;
  if (game.stakes === 1) {
    alert('No Pi to fold on!');
    return;
  }
  socket.emit('fold', { gameId: game.gameId, playerId: game.playerId });
  game.isMyTurn = false;
  updateGameControls();
});

document.getElementById('openBtn').addEventListener('click', () => {
  if (!game.isMyTurn) return;
  if (game.stakes === 1) {
    alert('No Pi to open!');
    return;
  }
  socket.emit('open', { gameId: game.gameId, playerId: game.playerId });
  game.isMyTurn = false;
  updateGameControls();
});

document.getElementById('createGameBtn').addEventListener('click', () => {
  socket.emit('createGame', {
    playerName: game.playerName,
    playerId: game.playerId,
    stakeValue: game.selectedStake
  });
});

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

document.getElementById('startGameBtn').addEventListener('click', () => {
  socket.emit('startGame', {
    gameId: game.gameId,
    playerId: game.playerId
  });
});

document.getElementById('nextRoundBtn').addEventListener('click', () => {
  socket.emit('startNextRound', { gameId: game.gameId });
});

// Fixed "End Game" button
document.getElementById('endGameBtn').addEventListener('click', (e) => {
  console.log('End Game button clicked', { gameId: game.gameId, playerId: game.playerId });
  const btn = e.target;
  btn.disabled = true;

  if (!game.gameId) {
    console.log('No valid gameId, cannot end game');
    alert('Game session not found. Returning to home.');
    showScreen('welcome');
    btn.disabled = false;
    return;
  }

  socket.emit('joinGame', { gameId: game.gameId, playerName: game.playerName, playerId: game.playerId }); // Re-join room
  socket.emit('endGame', { gameId: game.gameId, playerId: game.playerId });
  console.log('endGame event emitted', { gameId: game.gameId });

  game.gameEnder = game.playerId;

  socket.once('error', ({ message }) => {
    btn.disabled = false;
    if (message === 'Game not found') {
      console.log('Game not found, showing minimal end screen');
      const leaderboardElem = document.getElementById('leaderboardDisplay');
      leaderboardElem.innerHTML = '<h3>Game Leaderboard</h3><p>Game ended unexpectedly. Final scores unavailable.</p>';
      document.getElementById('gameEndText').innerHTML = `
        <p>${game.gameEnder === game.playerId ? 'You' : 'Someone'} ended the game.</p>
        <p>Returning to group chat...</p>
      `;
      const closeBtn = document.createElement('button');
      closeBtn.className = 'button';
      closeBtn.textContent = 'Close App';
      closeBtn.addEventListener('click', () => tgApp.close());
      document.getElementById('gameEndText').appendChild(closeBtn);
      showScreen('gameEnd');
      game.gameId = null;
    } else {
      alert(message);
    }
  });
});

document.getElementById('returnHomeBtn').addEventListener('click', () => {
  window.location.href = '/';
});

document.getElementById('leaveLobbyBtn').addEventListener('click', () => {
  socket.emit('leaveGame', { gameId: game.gameId, playerId: game.playerId });
  game.gameId = null;
  showScreen('welcome');
});

document.getElementById('leaveGameBtn').addEventListener('click', () => {
  console.log('Leave Game clicked', { gameId: game.gameId, playerId: game.playerId });
  if (!game.gameId) {
    console.log('No gameId, showing minimal end screen');
    document.getElementById('gameEndText').innerHTML = '<p>No active game to leave.</p>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'button';
    closeBtn.textContent = 'Close App';
    closeBtn.addEventListener('click', () => tgApp.close());
    document.getElementById('gameEndText').appendChild(closeBtn);
    document.getElementById('leaderboardDisplay').innerHTML = '<h3>Game Leaderboard</h3><p>No game data available.</p>';
    showScreen('gameEnd');
    return;
  }

  game.gameEnder = game.playerId;
  const stakes = game.stakes || 1;
  const penalty = stakes > 1 ? Math.floor(stakes / 2) : 1;
  document.getElementById('gameEndText').innerHTML = `
    <p>You forfeited the game.</p>
    <p>Penalty: -${penalty} point${penalty > 1 ? 's' : ''} (Waiting for final results...)</p>
  `;
  document.getElementById('leaderboardDisplay').innerHTML = '<h3>Game Leaderboard</h3><p>Loading final scores...</p>';
  showScreen('gameEnd');

  socket.emit('leaveGame', { gameId: game.gameId, playerId: game.playerId });
  game.isMyTurn = false;
});

  // Handle server response or timeout
  socket.on('gameEnded', ({ state, leaderboard, endedBy, forfeit }) => {
    console.log('Received gameEnded event', { gameId: game.gameId, endedBy, forfeit });
    game.gameEnder = endedBy || game.gameEnder;
    let enderPlayer = game.players.find(p => p.id === game.gameEnder || p.id === endedBy) || { name: 'Someone' };
    const enderName = enderPlayer.name;
  
    updateGameState(state, false); // Ensure latest state
  
    const leaderboardElem = document.getElementById('leaderboardDisplay');
    leaderboardElem.innerHTML = '<h3>Game Leaderboard</h3>';
    const leaderTable = document.createElement('table');
    leaderTable.className = 'leaderboard-table';
    const header = document.createElement('tr');
    header.innerHTML = `<th>Player</th><th>Points</th><th>Money</th>`;
    leaderTable.appendChild(header);
  
    leaderboard.forEach(player => {
      const dollars = player.points * (state.baseStakeValue || 100);
      const dollarsDisplay = dollars >= 0 ? `+${dollars}` : `-${Math.abs(dollars)}`;
      const row = document.createElement('tr');
      row.innerHTML = `<td>${player.name}${player.id === game.playerId ? ' (You)' : ''}</td><td>${player.points > 0 ? '+' : ''}${player.points}</td><td>${dollarsDisplay}</td>`;
      leaderTable.appendChild(row);
    });
    leaderboardElem.appendChild(leaderTable);
  
    let message = '';
    if (forfeit) {
      if (game.playerId === forfeit.loserId) {
        message = `
          <p>You forfeited the game.</p>
          <p>Penalty: -${forfeit.penalty} point${forfeit.penalty > 1 ? 's' : ''}.</p>
        `;
      } else {
        message = `
          <p>${forfeit.loserName} forfeited the game.</p>
          <p>You won ${forfeit.penalty} point${forfeit.penalty > 1 ? 's' : ''}.</p>
        `;
      }
    } else {
      message = game.gameEnder === game.playerId ? '<p>You ended the game.</p>' : `<p>${enderName} ended the game.</p>`;
    }
    document.getElementById('gameEndText').innerHTML = `
      ${message}
      <p>A full leaderboard has been posted to the group chat.</p>
    `;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'button';
    closeBtn.textContent = 'Close App';
    closeBtn.addEventListener('click', () => tgApp.close());
    document.getElementById('gameEndText').appendChild(closeBtn);
  
    // Force screen transition
    showScreen('gameEnd');
    game.gameId = null;
    game.isMyTurn = false;
    updateGameControls(); // Hide bid controls
  });

  setTimeout(() => {
    if (document.getElementById('gameEndText').innerHTML.includes('Waiting')) {
      document.getElementById('gameEndText').innerHTML = `
        <p>You forfeited the game.</p>
        <p>Penalty: -${penalty} point${penalty > 1 ? 's' : ''} (Final results unavailable due to server delay).</p>
      `;
      const closeBtn = document.createElement('button');
      closeBtn.className = 'button';
      closeBtn.textContent = 'Close App';
      closeBtn.addEventListener('click', () => tgApp.close());
      document.getElementById('gameEndText').appendChild(closeBtn);
      document.getElementById('leaderboardDisplay').innerHTML = '<h3>Game Leaderboard</h3><p>Final scores unavailable.</p>';
      game.gameId = null;
    }
  }, 5000);
});

document.getElementById('bidBtn').addEventListener('click', () => {
  if (!game.isMyTurn) return;
  if (game.bidValue === 1 && !game.isTsi) {
    game.isTsi = true;
    document.getElementById('tsiBtn').classList.add('selected');
  }
  if (game.currentBid) {
    let isValidBid = false;
    const valueHierarchy = (val) => val === 1 ? 7 : val; // 1s are highest
    if (game.currentBid.isTsi && !game.currentBid.isFly) {
      if (!game.isTsi && !game.isFly) return alert('After a Tsi (-) bid, you must choose Tsi (-) or Fly (+)!');
      if (game.isTsi) {
        isValidBid = (game.bidCount > game.currentBid.count) || 
                     (game.bidCount === game.currentBid.count && valueHierarchy(game.bidValue) > valueHierarchy(game.currentBid.value));
      } else if (game.isFly) {
        const minCount = game.currentBid.count * 2;
        isValidBid = game.bidCount >= minCount;
        if (!isValidBid) return alert(`Fly bid must double count to at least ${minCount}!`);
      }
    } else {
      isValidBid = (game.bidCount > game.currentBid.count) || 
                   (game.bidCount === game.currentBid.count && valueHierarchy(game.bidValue) > valueHierarchy(game.currentBid.value));
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

document.getElementById('challengeBtn').addEventListener('click', () => {
  if (!game.isMyTurn) return;
  if (!game.currentBid) {
    alert('There is no bid to challenge yet!');
    return;
  }
  if (game.stakes > 1) {
    socket.emit('open', { gameId: game.gameId, playerId: game.playerId });
  } else {
    socket.emit('challenge', { gameId: game.gameId, playerId: game.playerId });
  }
  game.isMyTurn = false;
  updateGameControls();
});

// Socket.io event handlers
socket.on('gameCreated', ({ gameId, state }) => {
  game.gameId = gameId;
  updateGameState(state);
  document.getElementById('gameIdDisplay').textContent = gameId;
  updateLobbyPlayerList();
  showScreen('lobby');
});

socket.on('gameJoined', ({ gameId, state, alreadyJoined }) => {
  game.gameId = gameId;
  updateGameState(state);
  game.players = state.players || game.players;
  game.baseStakeValue = state.baseStakeValue || game.baseStakeValue;
  updateLobbyPlayerList();
  showScreen('lobby');
});

socket.on('playerJoined', ({ player, state }) => {
  updateGameState(state);
  updateLobbyPlayerList();
  tgApp.HapticFeedback.notificationOccurred('success');
});

socket.on('gameStarted', ({ state, playerId }) => {
  if (playerId === game.playerId) {
    updateGameState(state);
    game.maxCount = state.players.length * 5;
    initializeBidButtons();
    updateGameUI();
    showScreen('game');
  }
});

socket.on('gameUpdate', ({ state }) => {
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
  updateGameState(state, false);
  game.isMyTurn = state.currentPlayerIndex !== null && 
                 state.players[state.currentPlayerIndex].id === game.playerId;
  updateGameUI();
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
  const winnerName = result.winner.name;
  const loserName = result.loser.name;
  const actualCount = result.actualCount;
  const bidValue = result.bid.value;
  const bidCount = result.bid.count;
  const isTsi = result.bid.isTsi;
  const isFly = result.bid.isFly;
  const bidDisplay = formatBidForDisplay(bidCount, bidValue, isTsi, isFly);
  const points = stakes || 1;
  const dollars = points * (baseStakeValue || 100);
  const isWinner = result.winner.id === game.playerId;
  const isLoser = result.loser.id === game.playerId;
  
  document.getElementById('roundSummaryText').innerHTML = `
    <h3>Round ${game.round} Results</h3>
    <p><strong>${challenger.name}</strong> challenged!</p>
    <p>Bid: ${bidDisplay}</p>
    <p>Actual count: ${actualCount} ${bidValue}'s</p>
    <p><strong>${winnerName}</strong> wins, <strong>${loserName}</strong> loses.</p>
    <p>Points: ${isWinner ? '+' : '-'}${points} (${isWinner ? '+' : '-'}$${dollars})</p>
  `;
  
  const diceReveal = document.getElementById('summaryDiceReveal');
  diceReveal.innerHTML = '';
  
  for (const playerId in allDice) {
    const playerName = game.players.find(p => p.id === playerId)?.name || 'Unknown';
    const playerDice = allDice[playerId];
    const playerDiceElem = document.createElement('div');
    playerDiceElem.className = 'player-dice';
    const playerNameElem = document.createElement('h4');
    playerNameElem.textContent = playerName;
    playerDiceElem.appendChild(playerNameElem);
    const diceContainer = document.createElement('div');
    diceContainer.className = 'dice-container';
    playerDice.forEach(value => {
      const dieElem = createDiceDots(value, value === 1);
      diceContainer.appendChild(dieElem);
    });
    playerDiceElem.appendChild(diceContainer);
    diceReveal.appendChild(playerDiceElem);
  }
  
  document.getElementById('nextRoundBtn').style.display = isLoser ? 'block' : 'none';
  document.getElementById('endGameBtn').style.display = isLoser ? 'block' : 'none';
  
  if (!isLoser) {
    document.getElementById('roundSummaryText').innerHTML += `
      <p class="waiting-message">Waiting for ${loserName} to decide whether to continue...</p>
    `;
  }
  
  showScreen('roundSummary');
});

socket.on('foldResult', ({ loser, winner, penalty, state, baseStakeValue }) => {
  const dollars = penalty * (baseStakeValue || 100);
  const isWinner = winner.id === game.playerId;
  const isLoser = loser.id === game.playerId;
  
  document.getElementById('roundSummaryText').innerHTML = `
    <h3>Round ${game.round} Results</h3>
    <p><strong>${loser.name}</strong> folded!</p>
    <p><strong>${winner.name}</strong> wins ${penalty} points ($${dollars})</p>
    <p>Points: ${isWinner ? '+' : '-'}${penalty} (${isWinner ? '+' : '-'}$${dollars})</p>
  `;
  
  document.getElementById('summaryDiceReveal').innerHTML = '';
  document.getElementById('nextRoundBtn').style.display = isLoser ? 'block' : 'none';
  document.getElementById('endGameBtn').style.display = isLoser ? 'block' : 'none';
  
  if (!isLoser) {
    document.getElementById('roundSummaryText').innerHTML += `
      <p class="waiting-message">Waiting for ${loser.name} to decide whether to continue...</p>
    `;
  }
  
  updateGameState(state);
  showScreen('roundSummary');
});

socket.on('roundStarted', ({ state, playerId, round }) => {
  if (playerId === game.playerId) {
    updateGameState(state);
    document.getElementById('roundNumber').textContent = round;
    game.bidHistory = [];
    game.currentBid = null;
    game.stakes = 1;
    game.piCount = 0;
    game.isTsi = false;
    game.isFly = false;
    document.getElementById('tsiBtn').classList.remove('selected');
    document.getElementById('flyBtn').classList.remove('selected');
    document.getElementById('tsiBtn').disabled = false;
    updateCurrentBidDisplay();
    updateStakesDisplay();
    initializeBidButtons();
    updateBidHistory();
    updateGameUI();
    showScreen('game');
  }
});

socket.on('endGame', ({ state, leaderboard, endedBy }) => {
  console.log('Received gameEnded event', { gameId: game.gameId, endedBy });
  game.gameEnder = endedBy || game.gameEnder;
  let enderPlayer = game.players.find(p => p.id === game.gameEnder || p.id === endedBy) || { name: 'Someone' };
  const enderName = enderPlayer.name;

  const leaderboardElem = document.getElementById('leaderboardDisplay');
  leaderboardElem.innerHTML = '<h3>Game Leaderboard</h3>';

  const leaderTable = document.createElement('table');
  leaderTable.className = 'leaderboard-table';
  const header = document.createElement('tr');
  header.innerHTML = `<th>Player</th><th>Points</th><th>Money</th>`;
  leaderTable.appendChild(header);

  leaderboard.forEach(player => {
    const dollars = player.points * (state.baseStakeValue || 100);
    const dollarsDisplay = dollars >= 0 ? `+${dollars}` : `-${Math.abs(dollars)}`;
    const row = document.createElement('tr');
    row.innerHTML = `<td>${player.name}${player.id === game.playerId ? ' (You)' : ''}</td><td>${player.points > 0 ? '+' : ''}${player.points}</td><td>${dollarsDisplay}</td>`;
    leaderTable.appendChild(row);
  });

  leaderboardElem.appendChild(leaderTable);

  let gameEndMessage = game.gameEnder === game.playerId ? `You ended the game.` : `${enderName} ended the game.`;
  document.getElementById('gameEndText').innerHTML = `
    <p>${gameEndMessage}</p>
    <p>A full leaderboard has been posted to the group chat.</p>
  `;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'button';
  closeBtn.textContent = 'Close App';
  closeBtn.addEventListener('click', () => tgApp.close());
  document.getElementById('gameEndText').appendChild(closeBtn);

  showScreen('gameEnd');
  game.gameId = null;
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

// Helper functions (unchanged)
function updateGameState(state, updateDice = true) {
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
  document.getElementById('startGameBtn').disabled = game.players.length < 2;
}

function updateGameUI() {
  const diceContainer = document.getElementById('diceContainer');
  diceContainer.innerHTML = '';
  game.myDice.forEach(dieValue => {
    const dieElement = createDiceDots(dieValue, dieValue === 1);
    diceContainer.appendChild(dieElement);
  });
  
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
  
  const gameStatus = document.getElementById('gameStatus');
  if (game.isMyTurn) {
    gameStatus.textContent = 'Your turn! Make a bid or call "Liar!"';
  } else if (game.currentPlayerIndex !== null) {
    const currentPlayerName = game.players[game.currentPlayerIndex]?.name || 'Unknown';
    gameStatus.textContent = `Waiting for ${currentPlayerName} to make a move...`;
  } else {
    gameStatus.textContent = 'Waiting for game to start...';
  }
  
  updateCurrentBidDisplay();
  updateStakesDisplay();
  
  const roundIndicator = document.getElementById('roundIndicator');
  const myScore = game.playerScores[game.playerId] || 0;
  const scoreDisplay = myScore >= 0 ? `+${myScore}p` : `${myScore}p`;
  const moneyDisplay = myScore >= 0 ? `+$${myScore * game.baseStakeValue}` : `-$${Math.abs(myScore * game.baseStakeValue)}`;
  document.getElementById('roundNumber').textContent = game.round;
  roundIndicator.innerHTML = `Round: <span id="roundNumber">${game.round}</span>&nbsp;&nbsp;|&nbsp;&nbsp;${scoreDisplay}&nbsp;&nbsp;|&nbsp;&nbsp;${moneyDisplay}`;
  
  updateGameControls();
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
  game.bidHistory.slice(-10).reverse().forEach(bid => {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.textContent = `${bid.playerName}: ${formatBidForDisplay(bid.count, bid.value, bid.isTsi, bid.isFly)}`;
    bidHistoryContainer.appendChild(historyItem);
  });
}

function updateGameControls() {
  const bidControls = document.getElementById('bidControls');
  if (game.isMyTurn) {
    bidControls.style.display = 'block';
  } else {
    bidControls.style.display = 'none';
    return;
  }
  
  const isInPiResponse = game.stakes > 1 && game.currentBid && game.isMyTurn;
  const countBidElem = document.querySelector('.bid-selector:nth-of-type(1)');
  const valueBidElem = document.querySelector('.bid-selector:nth-of-type(2)');
  const bidTypeButtons = document.querySelector('.bid-type-buttons');
  const bidBtn = document.getElementById('bidBtn');
  const challengeBtn = document.getElementById('challengeBtn');
  const piBtn = document.getElementById('piBtn');
  const foldBtn = document.getElementById('foldBtn');
  const openBtn = document.getElementById('openBtn');
  const flyButton = document.getElementById('flyBtn');
  const isFlyAvailable = game.currentBid && game.currentBid.isTsi && !game.currentBid.isFly;
  flyButton.style.display = isFlyAvailable ? 'inline-block' : 'none';
  
  if (game.stakes > 1) {
    challengeBtn.textContent = 'Open!';
  } else {
    challengeBtn.textContent = 'Call Liar!';
  }
  
  if (!game.currentBid) {
    countBidElem.style.display = 'block';
    valueBidElem.style.display = 'block';
    bidTypeButtons.style.display = 'block';
    bidBtn.style.display = 'block';
    challengeBtn.style.display = 'none';
    piBtn.style.display = 'none';
    foldBtn.style.display = 'none';
    openBtn.style.display = 'none';
    return;
  }
  
  if (isInPiResponse) {
    countBidElem.style.display = 'none';
    valueBidElem.style.display = 'none';
    bidTypeButtons.style.display = 'none';
    bidBtn.style.display = 'none';
    challengeBtn.style.display = 'none';
    const foldPenalty = Math.floor(game.stakes / 2);
    if (game.piCount < 3) {
      const piLabels = ["Pi (2x)", "Pi (4x)", "Pi (8x)"];
      piBtn.textContent = piLabels[game.piCount];
      piBtn.style.display = 'block';
    } else {
      piBtn.style.display = 'none';
    }
    foldBtn.textContent = `Fold (-${foldPenalty}p)`;
    foldBtn.style.display = 'block';
    openBtn.style.display = 'block';
  } else {
    countBidElem.style.display = 'block';
    valueBidElem.style.display = 'block';
    bidTypeButtons.style.display = 'block';
    bidBtn.style.display = 'block';
    challengeBtn.style.display = game.currentBid ? 'block' : 'none';
    piBtn.style.display = game.currentBid ? 'block' : 'none';
    foldBtn.style.display = 'none';
    openBtn.style.display = 'none';
    if (game.piCount < 3) {
      const piLabels = ["Pi (2x)", "Pi (4x)", "Pi (8x)"];
      piBtn.textContent = piLabels[game.piCount];
    } else {
      piBtn.style.display = 'none';
    }
  }
  updateBidValidity();
}

// Theme handling (unchanged)
if (tgApp.colorScheme === 'dark') {
  document.documentElement.style.setProperty('--tg-theme-bg-color', '#212121');
  document.documentElement.style.setProperty('--tg-theme-text-color', '#ffffff');
  document.documentElement.style.setProperty('--tg-theme-hint-color', '#aaaaaa');
  document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', '#2c2c2c');
}

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

window.addEventListener('load', checkForGameJoin);