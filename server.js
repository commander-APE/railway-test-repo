const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(__dirname));

const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flappy Clawb 2P</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        body { background: #0c4a6e; font-family: 'Press Start 2P', system-ui; margin:0; padding:20px; }
        canvas { image-rendering: pixelated; border: 8px solid #164e63; box-shadow: 0 0 40px rgba(0,0,0,0.6); max-width: 100%; }
        .overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: white; text-shadow: 2px 2px 0 #0e2a3d; pointer-events: none; }
    </style>
</head>
<body class="flex items-center justify-center min-h-screen bg-[#0c4a6e]">
    <div class="relative">
        <canvas id="canvas" width="520" height="580"></canvas>
        
        <div id="lobby" class="overlay">
            <div class="text-5xl mb-4">🐢 2P</div>
            <div class="text-3xl mb-8 text-yellow-300">FLAPPY CLAWB</div>
            <input id="player-name" type="text" value="Clawb" maxlength="9" 
                   class="block mx-auto bg-slate-900 border-4 border-sky-400 text-center p-4 text-3xl w-64 rounded-2xl mb-6 text-white">
            <button onclick="joinGame()" 
                    class="bg-emerald-500 hover:bg-emerald-400 px-16 py-6 text-3xl font-bold rounded-3xl border-4 border-white shadow-2xl">
                JOIN GAME
            </button>
            <div id="status" class="mt-8 text-sky-200 text-sm">Waiting for second player...</div>
        </div>

        <div id="game-over" class="overlay hidden bg-black/80 p-8 rounded-3xl">
            <div id="result-text" class="text-4xl mb-6"></div>
            <button onclick="location.reload()" class="bg-white text-black px-10 py-4 rounded-2xl text-xl font-bold">PLAY AGAIN</button>
        </div>
    </div>

    <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        let ws = null;
        let myId = null;
        let gameState = null;

        function joinGame() {
            const name = document.getElementById('player-name').value.trim() || "Player";
            document.getElementById('lobby').style.opacity = '0.3';
            
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = protocol + '//' + window.location.host;
            
            ws = new WebSocket(wsUrl);
            
            ws.onopen = () => console.log('Connected');
            
            ws.onmessage = (e) => {
                const msg = JSON.parse(e.data);
                if (msg.type === 'connected') myId = msg.playerId;
                if (msg.type === 'start' || msg.type === 'state') gameState = msg.state || msg.finalState || msg;
                if (msg.type === 'gameOver') {
                    gameState = msg.finalState || msg;
                    document.getElementById('game-over').classList.remove('hidden');
                    document.getElementById('result-text').innerHTML = 'GAME OVER<br><span class="text-2xl">' + Object.values(gameState.players || {}).map(p => p.name + ': ' + (p.score||0)).join('<br>') + '</span>';
                }
            };
            
            ws.onclose = () => console.log('Disconnected');
        }

        function flap() {
            if (ws && ws.readyState === WebSocket.OPEN && myId) {
                ws.send(JSON.stringify({type:'flap', playerId: myId}));
            }
        }

        function gameLoop() {
            ctx.fillStyle = '#0ea5e9';
            ctx.fillRect(0, 0, 520, 580);
            ctx.fillStyle = '#166534';
            ctx.fillRect(0, 500, 520, 80);
            
            if (gameState && gameState.players) {
                Object.values(gameState.players).forEach(p => {
                    if (!p.alive) return;
                    ctx.save();
                    ctx.translate(p.x || 150, p.y || 250);
                    ctx.rotate(p.rotation || 0);
                    ctx.fillStyle = p.color || '#10b981';
                    ctx.beginPath();
                    ctx.ellipse(0, 0, 18, 16, 0, 0, Math.PI*2);
                    ctx.fill();
                    ctx.restore();
                    
                    ctx.fillStyle = 'white';
                    ctx.font = '18px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(p.name || '??', (p.x||150), (p.y||250)-45);
                });
            }
            
            requestAnimationFrame(gameLoop);
        }

        document.addEventListener('keydown', e => { if ([' ','Enter','w','W','ArrowUp'].includes(e.key)) flap(); });
        canvas.addEventListener('click', flap);
        canvas.addEventListener('touchstart', e=>{e.preventDefault(); flap();});
        
        gameLoop();
    </script>
</body>
</html>`;

app.get('/', (req, res) => res.send(html));

const wss = new WebSocketServer({ server: app.listen(PORT, () => {
  console.log('Flappy Clawb 2P ready on port', PORT);
})});

let players = new Map();
let gameRunning = false;
let gameData = { players: {}, pipes: [], frame: 0 };

wss.on('connection', (socket) => {
  if (players.size >= 2) return socket.close();

  const id = players.size === 0 ? 'p1' : 'p2';
  players.set(socket, { id, name: id === 'p1' ? 'Clawb' : 'Shellby' });

  socket.send(JSON.stringify({ type: 'connected', playerId: id }));

  if (players.size === 2 && !gameRunning) {
    startGame();
  }

  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'name' && gameData.players[msg.playerId]) {
        gameData.players[msg.playerId].name = msg.name;
      }
      if (msg.type === 'flap' && gameData.players[msg.playerId]) {
        const p = gameData.players[msg.playerId];
        if (p.alive) p.velocity = -9;
      }
    } catch(e) {}
  });

  socket.on('close', () => {
    players.delete(socket);
    gameRunning = false;
  });
});

function startGame() {
  gameRunning = true;
  gameData = {
    players: {
      p1: { id: 'p1', name: 'Clawb', x: 140, y: 250, velocity: 0, rotation: 0, color: '#10b981', alive: true, score: 0 },
      p2: { id: 'p2', name: 'Shellby', x: 260, y: 250, velocity: 0, rotation: 0, color: '#3b82f6', alive: true, score: 0 }
    },
    pipes: [],
    frame: 0
  };

  broadcast({ type: 'start', state: gameData });

  let pipeCounter = 0;
  const gameInterval = setInterval(() => {
    if (!gameRunning || players.size < 2) {
      clearInterval(gameInterval);
      return;
    }

    gameData.frame++;

    Object.values(gameData.players).forEach(p => {
      if (!p.alive) return;
      p.velocity = (p.velocity || 0) + 0.65;
      p.y += p.velocity;
      p.rotation = Math.min(Math.max((p.velocity || 0) * 0.06, -0.8), 1.3);

      if (p.y < 40 || p.y > 480) p.alive = false;
    });

    pipeCounter++;
    if (pipeCounter > 55) {
      const top = 120 + Math.random() * 200;
      gameData.pipes.push({x: 550, topHeight: top, passed: new Set()});
      pipeCounter = 0;
    }

    for (let i = gameData.pipes.length - 1; i >= 0; i--) {
      const p = gameData.pipes[i];
      p.x -= 2.8;

      Object.values(gameData.players).forEach(player => {
        if (!player.alive) return;
        const hit = (player.x > p.x - 20 && player.x < p.x + 75) &&
                   (player.y < p.topHeight + 10 || player.y > p.topHeight + 160);
        if (hit) player.alive = false;

        if (p.x < player.x - 30 && !p.passed.has(player.id)) {
          p.passed.add(player.id);
          player.score += 10;
        }
      });

      if (p.x < -100) gameData.pipes.splice(i, 1);
    }

    const alive = Object.values(gameData.players).filter(p => p.alive).length;
    if (alive === 0) {
      gameRunning = false;
      broadcast({ type: 'gameOver', finalState: gameData });
    } else {
      broadcast({ type: 'state', state: gameData });
    }
  }, 30);
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (let [client] of players) {
    if (client.readyState === 1) client.send(data);
  }
}

console.log('🚀 Flappy Clawb 2P Railway edition started');
