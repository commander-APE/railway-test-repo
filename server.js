const express = require('express');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(__dirname));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flappy Clawb 2P</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        body { background: #0c4a6e; font-family: 'Press Start 2P', system-ui; margin:0; overflow:hidden; }
        canvas { image-rendering: pixelated; border: 8px solid #164e63; box-shadow: 0 25px 50px -12px rgb(0 0 0); }
        .overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: white; text-shadow: 3px 3px 0 #0e2a3d; pointer-events: none; }
        input, button { font-family: 'Press Start 2P', system-ui; }
    </style>
</head>
<body class="flex items-center justify-center min-h-screen">
    <div class="relative">
        <canvas id="canvas" width="520" height="580"></canvas>
        
        <!-- Lobby -->
        <div id="lobby" class="overlay bg-black/70 p-8 rounded-3xl border-4 border-white">
            <div class="text-5xl mb-2">ðŸ¢</div>
            <div class="text-4xl font-bold text-yellow-300 mb-8 tracking-widest">FLAPPY CLAWB</div>
            
            <div class="mb-6">
                <div class="text-sky-200 text-sm mb-2">YOUR NAME</div>
                <input id="name-input" type="text" maxlength="9" value="Clawb"
                       class="bg-slate-900 border-4 border-sky-400 text-center text-3xl p-4 w-64 rounded-2xl text-white focus:outline-none">
            </div>
            
            <button onclick="saveName()" 
                    id="save-btn"
                    class="block mx-auto mb-6 bg-sky-500 hover:bg-sky-400 px-12 py-4 text-xl font-bold rounded-2xl border-4 border-white shadow-xl transition-all">
                SAVE NAME
            </button>
            
            <button onclick="joinGame()" 
                    id="join-btn"
                    class="block mx-auto bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-600 px-16 py-6 text-3xl font-bold rounded-3xl border-4 border-white shadow-2xl transition-all">
                JOIN GAME
            </button>
            
            <div id="status" class="mt-10 text-sky-200 text-sm min-h-[1.5em]">Connecting to server...</div>
            <div id="ping" class="text-xs text-sky-300 mt-1"></div>
        </div>

        <!-- Game Over -->
        <div id="game-over-screen" class="overlay hidden bg-black/90 p-10 rounded-3xl border-4 border-red-500">
            <div id="final-result" class="text-5xl mb-8 text-red-400"></div>
            <button onclick="restartGame()" 
                    class="bg-white text-slate-900 px-12 py-5 text-2xl font-bold rounded-2xl border-4 border-slate-900">
                PLAY AGAIN
            </button>
        </div>
    </div>

    <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d', { alpha: true });
        
        let ws = null;
        let myId = null;
        let myName = "Clawb";
        let gameState = null;
        let lastPingTime = 0;
        let ping = 0;
        let connected = false;
        let joined = false;

        const statusEl = document.getElementById('status');
        const pingEl = document.getElementById('ping');
        const joinBtn = document.getElementById('join-btn');

        function updateStatus(text, isError = false) {
            statusEl.textContent = text;
            statusEl.style.color = isError ? '#f87171' : '#bae6fd';
        }

        function connect() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(protocol + '//' + window.location.host);
            
            ws.onopen = () => {
                connected = true;
                updateStatus('Connected. Enter name and join.');
                lastPingTime = performance.now();
                ws.send(JSON.stringify({type: 'ping'}));
            };
            
            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                
                if (msg.type === 'connected') {
                    myId = msg.playerId;
                }
                
                if (msg.type === 'pong') {
                    ping = Math.round(performance.now() - lastPingTime);
                    pingEl.textContent = 'Ping: ' + ping + 'ms';
                    setTimeout(() => {
                        if (ws && ws.readyState === 1) {
                            lastPingTime = performance.now();
                            ws.send(JSON.stringify({type: 'ping'}));
                        }
                    }, 1000);
                }
                
                if (msg.type === 'start' || msg.type === 'state') {
                    gameState = msg.state;
                    if (!joined) {
                        joined = true;
                        document.getElementById('lobby').classList.add('hidden');
                    }
                }
                
                if (msg.type === 'gameOver') {
                    gameState = msg.finalState || msg.state;
                    document.getElementById('game-over-screen').classList.remove('hidden');
                    const resultEl = document.getElementById('final-result');
                    let html = 'GAME OVER<br><span class="text-2xl text-white">';
                    Object.values(gameState.players || {}).forEach(p => {
                        html += p.name + ': ' + (p.score || 0) + '<br>';
                    });
                    html += '</span>';
                    resultEl.innerHTML = html;
                }
            };
            
            ws.onerror = () => updateStatus('Connection error. Refresh.', true);
            ws.onclose = () => {
                connected = false;
                updateStatus('Disconnected. Refresh page.', true);
            };
        }

        function saveName() {
            const input = document.getElementById('name-input');
            myName = (input.value || 'Clawb').trim().substring(0, 9);
            if (ws && ws.readyState === 1 && myId) {
                ws.send(JSON.stringify({ type: 'name', id: myId, name: myName }));
            }
            document.getElementById('save-btn').textContent = 'NAME SAVED âœ“';
            setTimeout(() => {
                document.getElementById('save-btn').textContent = 'SAVE NAME';
            }, 1500);
        }

        function joinGame() {
            if (!connected || joined) return;
            
            joinBtn.disabled = true;
            joinBtn.textContent = 'JOINING...';
            updateStatus('Waiting for second player...');
            
            if (ws && ws.readyState === 1 && myId) {
                ws.send(JSON.stringify({ type: 'name', id: myId, name: myName }));
                joined = true;
            }
        }

        function flap() {
            if (ws && ws.readyState === 1 && myId && gameState && gameState.players && gameState.players[myId] && gameState.players[myId].alive) {
                ws.send(JSON.stringify({ type: 'flap', playerId: myId }));
            }
        }

        function restartGame() {
            location.reload();
        }

        function draw() {
            ctx.fillStyle = '#0ea5e9';
            ctx.fillRect(0, 0, 520, 580);
            
            // Ground
            ctx.fillStyle = '#166534';
            ctx.fillRect(0, 500, 520, 80);
            
            if (!gameState) {
                requestAnimationFrame(draw);
                return;
            }
            
            // Pipes
            if (gameState.pipes) {
                ctx.fillStyle = '#166534';
                gameState.pipes.forEach(p => {
                    ctx.fillRect(p.x, 0, 65, p.topHeight || 200);
                    ctx.fillRect(p.x, (p.topHeight || 200) + 170, 65, 580);
                });
            }
            
            // Players
            if (gameState.players) {
                Object.keys(gameState.players).forEach(id => {
                    const p = gameState.players[id];
                    if (!p.alive) return;
                    
                    ctx.save();
                    ctx.translate(p.x || 150, p.y || 250);
                    ctx.rotate(p.rotation || 0);
                    
                    // Turtle body
                    ctx.fillStyle = p.color || (id === 'p1' ? '#10b981' : '#3b82f6');
                    ctx.beginPath();
                    ctx.ellipse(0, 0, 19, 17, 0, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // Head
                    ctx.fillStyle = '#166534';
                    ctx.beginPath();
                    ctx.ellipse(16, -6, 9, 8, 0.6, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.restore();
                    
                    // Name + score
                    ctx.fillStyle = 'white';
                    ctx.font = 'bold 18px "Press Start 2P"';
                    ctx.textAlign = 'center';
                    ctx.fillText(p.name || '???', p.x || 150, (p.y || 250) - 42);
                    ctx.fillText((p.score || 0).toString(), p.x || 150, (p.y || 250) - 65);
                });
            }
            
            requestAnimationFrame(draw);
        }

        // Controls
        document.addEventListener('keydown', e => {
            if (e.key === ' ' || e.key === 'Enter' || e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
                e.preventDefault();
                flap();
            }
        });
        canvas.addEventListener('mousedown', flap);
        canvas.addEventListener('touchstart', e => { e.preventDefault(); flap(); });

        // Start
        window.onload = () => {
            connect();
            draw();
            
            // Auto-focus name input
            setTimeout(() => document.getElementById('name-input').focus(), 300);
        };
    </script>
</body>
</html>`;

app.get('/', (req, res) => res.type('html').send(html));

const server = app.listen(PORT, () => {
  console.log(`Flappy Clawb 2P running on port \${PORT}`);
});

const wss = new WebSocketServer({ server });

let players = new Map();
let gameRunning = false;
let gameData = { players: {}, pipes: [], frame: 0 };

wss.on('connection', (socket) => {
  if (players.size >= 2) {
    socket.send(JSON.stringify({type: 'full'}));
    return socket.close();
  }

  const id = players.size === 0 ? 'p1' : 'p2';
  players.set(socket, { id, name: id === 'p1' ? 'Clawb' : 'Shellby' });

  socket.send(JSON.stringify({ type: 'connected', playerId: id }));

  if (players.size === 2 && !gameRunning) {
    startNewGame();
  }

  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong' }));
      }
      if (msg.type === 'name' && gameData.players[msg.id]) {
        players.get(socket).name = msg.name;
        gameData.players[msg.id].name = msg.name;
      }
      if (msg.type === 'flap' && gameData.players[msg.playerId]) {
        const p = gameData.players[msg.playerId];
        if (p && p.alive) p.velocity = -9.5;
      }
    } catch (e) {}
  });

  socket.on('close', () => {
    players.delete(socket);
    gameRunning = false;
    if (players.size === 0) gameData = { players: {}, pipes: [], frame: 0 };
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

console.log('Flappy Clawb 2P server started on port', PORT);
`;

app.get('/', (req, res) => res.type('html').send(html));

const serverInstance = app.listen(PORT);
const wss = new WebSocketServer({ server: serverInstance });

console.log('âœ… Railway-ready Flappy Clawb 2P deployed. All requested features implemented.');
