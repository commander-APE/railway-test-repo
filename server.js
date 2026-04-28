const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`Flappy Clawb 2P running on port ${PORT}`);
});

const wss = new WebSocketServer({ server });

let players = new Map();
let gameRunning = false;
let gameData = { players: {}, pipes: [], frame: 0 };
let readyPlayers = new Set();

wss.on('connection', (socket) => {
  if (players.size >= 2) {
    socket.send(JSON.stringify({type: 'full'}));
    return socket.close();
  }

  const id = players.size === 0 ? 'p1' : 'p2';
  players.set(socket, { id, name: id === 'p1' ? 'Clawb' : 'Shellby' });

  socket.send(JSON.stringify({ type: 'connected', playerId: id }));

  if (players.size === 2) {
    readyPlayers.clear();
  }

  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong' }));
      }
      
      if (msg.type === 'name' && gameData.players[msg.id]) {
        const playerData = players.get(socket);
        if (playerData) playerData.name = msg.name;
        if (gameData.players[msg.id]) gameData.players[msg.id].name = msg.name;
      }
      
      if (msg.type === 'chat' && msg.message) {
        broadcast({
          type: 'chat',
          playerId: msg.playerId || id,
          name: msg.name || 'Player',
          message: msg.message
        });
      }
      
      if (msg.type === 'ready' && msg.id) {
        readyPlayers.add(msg.id);
        if (readyPlayers.size === 2 && !gameRunning) {
          startNewGame();
        }
      }
      
      if (msg.type === 'flap' && gameData.players[msg.playerId]) {
        const p = gameData.players[msg.playerId];
        if (p && p.alive) p.velocity = -9.5;
      }
    } catch (e) {}
  });

  socket.on('close', () => {
    players.delete(socket);
    readyPlayers.clear();
    gameRunning = false;
  });
});

function startNewGame() {
  gameRunning = true;
  gameData = {
    players: {
      p1: { id: 'p1', name: 'Clawb', x: 160, y: 250, velocity: 0, rotation: 0, color: '#10b981', alive: true, score: 0 },
      p2: { id: 'p2', name: 'Shellby', x: 280, y: 250, velocity: 0, rotation: 0, color: '#3b82f6', alive: true, score: 0 }
    },
    pipes: [],
    frame: 0
  };

  broadcast({ type: 'start', state: gameData });

  let pipeTimer = 0;
  const interval = setInterval(() => {
    if (!gameRunning || players.size < 2) {
      clearInterval(interval);
      return;
    }

    gameData.frame++;
    pipeTimer++;

    Object.values(gameData.players).forEach(p => {
      if (!p.alive) return;
      p.velocity = (p.velocity || 0) + 0.68;
      p.y = (p.y || 250) + p.velocity;
      p.rotation = Math.min(Math.max((p.velocity || 0) * 0.055, -0.9), 1.4);
      
      if (p.y < 40 || p.y > 480) p.alive = false;
    });

    if (pipeTimer > 65) {
      const top = 100 + Math.random() * 220;
      gameData.pipes.push({ x: 550, topHeight: top, passed: new Set() });
      pipeTimer = 0;
    }

    for (let i = gameData.pipes.length - 1; i >= 0; i--) {
      const pipe = gameData.pipes[i];
      pipe.x -= 2.9;

      Object.values(gameData.players).forEach(player => {
        if (!player.alive) return;
        const r = 18;
        const hit = (player.x > pipe.x - 10 && player.x < pipe.x + 75) &&
                   ((player.y - r < pipe.topHeight) || (player.y + r > pipe.topHeight + 165));
        if (hit) player.alive = false;

        if (pipe.x + 65 < player.x && !pipe.passed.has(player.id)) {
          pipe.passed.add(player.id);
          player.score = (player.score || 0) + 10;
        }
      });

      if (pipe.x < -100) gameData.pipes.splice(i, 1);
    }

    const alivePlayers = Object.values(gameData.players).filter(p => p.alive).length;
    if (alivePlayers === 0) {
      gameRunning = false;
      broadcast({ type: 'gameOver', finalState: gameData });
    } else {
      broadcast({ type: 'state', state: gameData });
    }
  }, 30);
}

function broadcast(msg) {
  const str = JSON.stringify(msg);
  for (let [client] of players) {
    if (client.readyState === 1) client.send(str);
  }
}

console.log('✅ Flappy Clawb 2P with chat + ready system started on port', PORT);
