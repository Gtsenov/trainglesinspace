// triangle_game.js

// —— Globals ——
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let WIDTH    = window.innerWidth;
let HEIGHT   = window.innerHeight;
canvas.width  = WIDTH;
canvas.height = HEIGHT;

let triangleWidth  = 60;
let triangleHeight = 80;
let triangleSpeed  = 6;
let triangleX = WIDTH / 2,
    triangleY = HEIGHT / 2;

let projectiles = [];
let circles     = [];
let backgroundCircles = [];

let shooters = [];
let shooterBullets = [];

let score    = 0;
let gameOver = false;

// Level Timer
let levelTimer = 40; // seconds
let levelTimerInterval = null;

// Scoreboard (persistent)
let scoreboard = [];
let nameInputElement = null;
const SCOREBOARD_KEY = 'triangleGameScoreboard';

// Immune state
let triangleImmune = false;
let triangleImmuneTimeout = null;
let pendingLevelClearImmunity = false;

// Input state
const keys = {};
const touchMoveThreshold = 10;
let touchActive = false, touchStartX = 0, touchStartY = 0;
let draggingTriangle = false, dragOffsetX = 0, dragOffsetY = 0;

// Mobile shoot button (created dynamically)
let mobBtn = null;
let mobBtnRect = null;

function createMobileShootButton() {
  if (mobBtn) return;
  mobBtn = document.createElement('button');
  mobBtn.id = 'mobileShootBtn';
  mobBtn.innerText = 'FIRE';
  Object.assign(mobBtn.style, {
    position: 'fixed',
    right: '5vw',
    bottom: '7vh',
    width: '56px', // smaller size
    height: '56px',
    fontSize: '1.1em',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #ff2222 60%, #ff8800 100%)',
    color: '#fff',
    border: 'none',
    boxShadow: '0 2px 8px #0006',
    zIndex: 3000,
    display: 'none',
    outline: 'none',
    userSelect: 'none',
    touchAction: 'none',
    opacity: 0.97,
    padding: '0',
    lineHeight: '56px',
    textAlign: 'center',
    fontWeight: 'bold',
    letterSpacing: '1px',
  });
  mobBtn.addEventListener('touchstart', e => {
    e.preventDefault();
    projectiles.push({ x: triangleX, y: triangleY - triangleHeight/2 });
  }, { passive: false });
  mobBtn.addEventListener('mousedown', e => {
    e.preventDefault();
    projectiles.push({ x: triangleX, y: triangleY - triangleHeight/2 });
  });
  document.body.appendChild(mobBtn);
}

function updateMobileShootBtnVisibility() {
  if (!mobBtn) return;
  if (window.innerWidth <= 800 || window.innerHeight <= 600) {
    mobBtn.style.display = 'block';
    // Update rect for collision avoidance
    const rect = mobBtn.getBoundingClientRect();
    mobBtnRect = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom
    };
  } else {
    mobBtn.style.display = 'none';
    mobBtnRect = null;
  }
}

createMobileShootButton();
updateMobileShootBtnVisibility();
window.addEventListener('resize', updateMobileShootBtnVisibility);

// —— Initialization ——

function loadScoreboard() {
  try {
    const data = localStorage.getItem(SCOREBOARD_KEY);
    scoreboard = data ? JSON.parse(data) : [];
  } catch (e) {
    scoreboard = [];
  }
}

function saveScoreboard() {
  try {
    localStorage.setItem(SCOREBOARD_KEY, JSON.stringify(scoreboard));
  } catch (e) {}
}

function spawnBackgroundCircles() {
  backgroundCircles = [];
  const numStars = Math.floor(WIDTH * HEIGHT / 1200);
  for (let i = 0; i < numStars; i++) {
    const r = Math.random() < 0.7
      ? randomBetween(0.5, 1.5)
      : randomBetween(1.5, 2.5);
    backgroundCircles.push({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      r,
      color: '#fff'
    });
  }
}

function spawnCircles() {
  circles = [];
  const triRad = Math.min(triangleWidth, triangleHeight) / 2;

  // small (1 hit)
  for (let i = 0; i < 20; i++) {
    if (Math.random() < 0.25) {
      const r = triRad / 2;
      const vx = (Math.random() < 0.5 ? -1 : 1) * randomBetween(1.5, 3.5);
      const vy = Math.random() < 0.65
        ? (Math.random() < 0.5 ? -1 : 1) * randomBetween(1, 2.5)
        : 0;
      circles.push({ x: randomBetween(r, WIDTH - r), y: randomBetween(r, HEIGHT - r), r, hits: 0, maxHits: 1, color: '#ff2222', vx, vy });
    }
  }

  // middle (5 hits)
  for (let i = 0; i < 20; i++) {
    if (Math.random() < 0.5) {
      const r = triRad;
      const vx = (Math.random() < 0.5 ? -1 : 1) * randomBetween(1, 2.5);
      const vy = Math.random() < 0.65
        ? (Math.random() < 0.5 ? -1 : 1) * randomBetween(0.7, 2)
        : 0;
      circles.push({ x: randomBetween(r, WIDTH - r), y: randomBetween(r, HEIGHT - r), r, hits: 0, maxHits: 5, color: '#ff2222', vx, vy });
    }
  }

  // big (10 hits, no overlap)
  for (let i = 0; i < 3; i++) {
    if (Math.random() < 0.25) {
      const r = triRad * 2;
      let x, y, ok, tries = 0;
      do {
        x = randomBetween(r, WIDTH - r);
        y = randomBetween(r, HEIGHT - r);
        ok = !circles.some(c => Math.hypot(x - c.x, y - c.y) < c.r + r + 4);
        tries++;
      } while (!ok && tries < 100);
      const vx = (Math.random() < 0.5 ? -1 : 1) * randomBetween(0.5, 1.5);
      const vy = Math.random() < 0.65
        ? (Math.random() < 0.5 ? -1 : 1) * randomBetween(0.3, 1)
        : 0;
      circles.push({ x, y, r, hits: 0, maxHits: 10, color: '#ff2222', vx, vy });
    }
  }

  // Clamp velocities
  for (const c of circles) {
    c.vx = Math.sign(c.vx) * Math.min(Math.max(Math.abs(c.vx), 0.5), 3.5);
    if (c.vy !== 0) c.vy = Math.sign(c.vy) * Math.min(Math.max(Math.abs(c.vy), 0.3), 2.5);
  }
}

function spawnShooters() {
  shooters = [];
  shooterBullets = [];
  const spacing = WIDTH / 4;
  for (let i = 0; i < 3; i++) {
    shooters.push({
      x: spacing * (i + 1),
      y: 60,
      size: 40,
      color: '#00ff44',
      nextShot: Date.now() + 5000 * (1 + Math.random()),
    });
    shooterBullets.push(null);
  }
}

function resetGame() {
  triangleX = WIDTH / 2;
  triangleY = HEIGHT / 2;
  projectiles = [];
  score = 0;
  gameOver = false;
  window._scoreSubmittedForThisGame = false;
  spawnBackgroundCircles();
  spawnCircles();
  spawnShooters();
  triangleImmune = true;
  clearTimeout(triangleImmuneTimeout);
  triangleImmuneTimeout = setTimeout(() => { triangleImmune = false; }, 3000);
  startLevelTimer();
  hidePlayAgainButton();
  hideNameInput();
  updateMobileShootBtnVisibility(); // Ensure button visibility is updated on reset
}

function startLevelTimer() {
  levelTimer = 40;
  clearInterval(levelTimerInterval);
  levelTimerInterval = setInterval(() => {
    if (gameOver) return;
    levelTimer--;
    if (levelTimer <= 0) {
      levelTimer = 0;
      gameOver = true;
      clearInterval(levelTimerInterval);
    }
  }, 1000);
}

function stopLevelTimer() {
  clearInterval(levelTimerInterval);
  levelTimerInterval = null;
}

function randomBetween(a, b) {
  return Math.random() * (b - a) + a;
}


// —— Input & Resize Handlers ——

// Resize
window.addEventListener('resize', () => {
  WIDTH = window.innerWidth;
  HEIGHT = window.innerHeight;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  resetGame();
});

// Mouse
canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  if (mx >= triangleX - triangleWidth/2 && mx <= triangleX + triangleWidth/2 &&
      my >= triangleY - triangleHeight/2 && my <= triangleY + triangleHeight/2) {
    draggingTriangle = true;
    dragOffsetX = mx - triangleX;
    dragOffsetY = my - triangleY;
  }
});
canvas.addEventListener('mousemove', e => {
  if (!draggingTriangle) return;
  const rect = canvas.getBoundingClientRect();
  triangleX = e.clientX - rect.left - dragOffsetX;
  triangleY = e.clientY - rect.top  - dragOffsetY;
  triangleX = Math.max(triangleWidth/2, Math.min(WIDTH - triangleWidth/2, triangleX));
  triangleY = Math.max(triangleHeight/2, Math.min(HEIGHT - triangleHeight/2, triangleY));
});
canvas.addEventListener('mouseup',   () => draggingTriangle = false);
canvas.addEventListener('mouseleave',() => draggingTriangle = false);

// Touch
canvas.addEventListener('touchstart', e => {
  const rect = canvas.getBoundingClientRect();
  const t = e.touches[0];
  const x = t.clientX - rect.left;
  const y = t.clientY - rect.top;
  if (x >= triangleX - triangleWidth/2 && x <= triangleX + triangleWidth/2 &&
      y >= triangleY - triangleHeight/2 && y <= triangleY + triangleHeight/2) {
    draggingTriangle = true;
    dragOffsetX = x - triangleX;
    dragOffsetY = y - triangleY;
  } else {
    touchActive = true;
    touchStartX = x;
    touchStartY = y;
    if (y < triangleY - triangleHeight/2) {
      projectiles.push({ x: triangleX, y: triangleY - triangleHeight/2 });
    }
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  const rect = canvas.getBoundingClientRect();
  const t = e.touches[0];
  const x = t.clientX - rect.left;
  const y = t.clientY - rect.top;
  if (draggingTriangle) {
    triangleX = x - dragOffsetX;
    triangleY = y - dragOffsetY;
    triangleX = Math.max(triangleWidth/2, Math.min(WIDTH - triangleWidth/2, triangleX));
    triangleY = Math.max(triangleHeight/2, Math.min(HEIGHT - triangleHeight/2, triangleY));
  } else if (touchActive) {
    const dx = x - touchStartX;
    const dy = y - touchStartY;
    if (Math.hypot(dx, dy) > touchMoveThreshold) {
      triangleX += dx;
      triangleY += dy;
      triangleX = Math.max(triangleWidth/2, Math.min(WIDTH - triangleWidth/2, triangleX));
      triangleY = Math.max(triangleHeight/2, Math.min(HEIGHT - triangleHeight/2, triangleY));
      touchStartX = x;
      touchStartY = y;
    }
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', () => {
  draggingTriangle = false;
  touchActive = false;
});

// Keyboard & Shooting
document.addEventListener('keydown', e => {
  // Prevent reset if typing in the name input
  if (gameOver && (e.key === 'r' || e.key === 'R')) {
    if (nameInputElement && document.activeElement === nameInputElement) {
      // Ignore R if typing name
      return;
    }
    resetGame();
    return;
  }
  keys[e.key.toLowerCase()] = true;
  if (!gameOver && e.code === 'Space' && !keys['space']) {
    projectiles.push({ x: triangleX, y: triangleY - triangleHeight/2 });
  }
});
document.addEventListener('keyup', e => {
  keys[e.key.toLowerCase()] = false;
});

// Mobile shoot button
if (mobBtn) {
  function updateBtnVisibility() {
    mobBtn.style.display = (window.innerWidth <= 800 || window.innerHeight <= 600)
      ? 'block' : 'none';
  }
  window.addEventListener('resize', updateBtnVisibility);
  updateBtnVisibility();
  mobBtn.addEventListener('touchstart', e => {
    e.preventDefault();
    projectiles.push({ x: triangleX, y: triangleY - triangleHeight/2 });
  }, { passive: false });
  mobBtn.addEventListener('mousedown', e => {
    e.preventDefault();
    projectiles.push({ x: triangleX, y: triangleY - triangleHeight/2 });
  });
}


// —— Collision & Update Logic ——

function triangleSquareCollision(tx, ty, tw, th, sx, sy, sr) {
  const triL = tx - tw/2, triR = tx + tw/2;
  const triT = ty - th/2, triB = ty + th/2;
  const sqL  = sx - sr,    sqR  = sx + sr;
  const sqT  = sy - sr,    sqB  = sy + sr;
  return triL < sqR && triR > sqL && triT < sqB && triB > sqT;
}

function updateProjectiles() {
  projectiles.forEach(p => p.y -= 12);
  projectiles = projectiles.filter(p => p.y > -20);
  for (let i = circles.length - 1; i >= 0; i--) {
    const c = circles[i];
    for (let j = projectiles.length - 1; j >= 0; j--) {
      const p = projectiles[j];
      const dx = Math.abs(p.x - c.x);
      const dy = Math.abs((p.y + 8) - c.y);
      if (Math.hypot(dx, dy) < c.r + 8) {
        c.hits++;
        projectiles.splice(j, 1);
        if (c.hits >= c.maxHits) {
          circles.splice(i, 1);
          score++;
          if (circles.length === 0) {
            pendingLevelClearImmunity = true;
          }
        }
        break;
      }
    }
  }
}

function updateCircles() {
  circles.forEach(c => {
    c.x += c.vx;
    c.y += c.vy;
    if (c.x - c.r < 0 || c.x + c.r > WIDTH)  c.vx *= -1;
    if (c.y - c.r < 0 || c.y + c.r > HEIGHT) c.vy *= -1;
  });
}

function update() {
  // Shooters logic
  for (let i = 0; i < shooters.length; i++) {
    const shooter = shooters[i];
    if (!shooterBullets[i] && Date.now() > shooter.nextShot) {
      shooterBullets[i] = {
        x: shooter.x,
        y: shooter.y + shooter.size / 2,
        vy: 4,
        size: 16,
      };
      shooter.nextShot = Date.now() + 5000;
    }
    if (shooterBullets[i]) {
      shooterBullets[i].y += shooterBullets[i].vy;
      if (!triangleImmune &&
          shooterBullets[i].x > triangleX - triangleWidth/2 &&
          shooterBullets[i].x < triangleX + triangleWidth/2 &&
          shooterBullets[i].y + shooterBullets[i].size/2 > triangleY - triangleHeight/2 &&
          shooterBullets[i].y - shooterBullets[i].size/2 < triangleY + triangleHeight/2
      ) {
        gameOver = true;
      }
      if (shooterBullets[i].y - shooterBullets[i].size > HEIGHT) {
        shooterBullets[i] = null;
      }
    }
  }

  if (gameOver) return;

  updateProjectiles();
  updateCircles();

  if (keys['a']) triangleX -= triangleSpeed;
  if (keys['d']) triangleX += triangleSpeed;
  if (keys['w']) triangleY -= triangleSpeed;
  if (keys['s']) triangleY += triangleSpeed;

  triangleX = Math.max(triangleWidth/2, Math.min(WIDTH - triangleWidth/2, triangleX));
  triangleY = Math.max(triangleHeight/2, Math.min(HEIGHT - triangleHeight/2, triangleY));

  if (!triangleImmune) {
    for (const c of circles) {
      if (triangleSquareCollision(triangleX, triangleY, triangleWidth, triangleHeight, c.x, c.y, c.r)) {
        gameOver = true;
        break;
      }
    }
  }

  if (pendingLevelClearImmunity) {
    spawnBackgroundCircles();
    spawnCircles();
    spawnShooters();
    triangleImmune = true;
    clearTimeout(triangleImmuneTimeout);
    triangleImmuneTimeout = setTimeout(() => { triangleImmune = false; }, 2000);
    pendingLevelClearImmunity = false;
    startLevelTimer();
  }
}


// —— Rendering ——

function drawBackgroundCircles() {
  backgroundCircles.forEach(c => {
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, 2 * Math.PI);
    ctx.fill();
  });
}

function drawCircles() {
  circles.forEach(c => {
    // On mobile, avoid drawing under the fire button
    if (mobBtnRect && window.innerWidth <= 800) {
      // Convert canvas to screen coordinates
      const scaleX = canvas.width / canvas.offsetWidth;
      const scaleY = canvas.height / canvas.offsetHeight;
      const screenX = c.x / scaleX;
      const screenY = c.y / scaleY;
      const r = c.r / scaleX;
      // If overlaps with fire button, skip drawing
      if (
        screenX + r > mobBtnRect.left &&
        screenX - r < mobBtnRect.right &&
        screenY + r > mobBtnRect.top &&
        screenY - r < mobBtnRect.bottom
      ) {
        return;
      }
    }
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
  });
}

function drawProjectiles() {
  projectiles.forEach(p => {
    ctx.fillStyle = '#00ff44';
    ctx.fillRect(p.x - 4, p.y - 16, 8, 16);
  });
}

function drawScoreboard() {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 2em Arial';
  ctx.fillText('Top 10 Scores', WIDTH/2, HEIGHT/2 - 80);
  ctx.font = '1.5em Arial';
  for (let i = 0; i < scoreboard.length; i++) {
    const entry = scoreboard[i];
    ctx.fillText(
      `${i + 1}. ${entry.name}: ${entry.score}`,
      WIDTH/2,
      HEIGHT/2 - 40 + i * 30
    );
  }
  ctx.restore();
}

function showPlayAgainButton() {
  if (document.getElementById('playAgainBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'playAgainBtn';
  btn.innerText = 'Play Again';
  Object.assign(btn.style, {
    position: 'fixed', left: '50%', top: '80%', transform: 'translate(-50%, -50%)',
    fontSize: '2em', padding: '16px 32px', borderRadius: '8px',
    background: '#0078ff', color: '#fff', border: 'none', cursor: 'pointer', zIndex: 2000
  });
  btn.onclick = () => resetGame();
  document.body.appendChild(btn);
}

function hidePlayAgainButton() {
  const btn = document.getElementById('playAgainBtn');
  if (btn) btn.remove();
}

function showNameInput() {
  if (nameInputElement) return;
  // Create wrapper div for input and button
  const wrapper = document.createElement('div');
  wrapper.id = 'nameInputWrapper';
  Object.assign(wrapper.style, {
    position: 'fixed', left: '50%', top: '45%', transform: 'translate(-50%, -50%)',
    zIndex: 2001, display: 'flex', flexDirection: 'row', alignItems: 'center',
    background: 'rgba(255,255,255,0.95)', padding: '12px 24px', borderRadius: '12px',
    boxShadow: '0 2px 12px #0003',
  });
  nameInputElement = document.createElement('input');
  nameInputElement.type = 'text';
  nameInputElement.maxLength = 12;
  nameInputElement.placeholder = 'Enter your name';
  Object.assign(nameInputElement.style, {
    fontSize: '2em', padding: '8px 16px', borderRadius: '8px',
    border: '2px solid #0078ff', outline: 'none',
    textAlign: 'center', background: '#fff', color: '#0078ff',
    marginRight: '12px',
  });
  const submitBtn = document.createElement('button');
  submitBtn.innerText = 'Submit';
  Object.assign(submitBtn.style, {
    fontSize: '1.3em', padding: '8px 20px', borderRadius: '8px',
    background: '#0078ff', color: '#fff', border: 'none', cursor: 'pointer',
    height: '48px',
  });
  function doSubmit() {
    const name = nameInputElement.value.trim() || 'Anonymous';
    // Remove wrapper and input
    const w = document.getElementById('nameInputWrapper');
    if (w && w.parentElement) w.parentElement.removeChild(w);
    nameInputElement = null;
    submitScore(name);
  }
  submitBtn.onclick = doSubmit;
  nameInputElement.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      doSubmit();
    }
  });
  wrapper.appendChild(nameInputElement);
  wrapper.appendChild(submitBtn);
  document.body.appendChild(wrapper);
  nameInputElement.focus();
}

function hideNameInput() {
  // Always remove the wrapper if it exists
  const w = document.getElementById('nameInputWrapper');
  if (w && w.parentElement) w.parentElement.removeChild(w);
  nameInputElement = null;
}

function submitScore(name) {
  name = name || 'Anonymous';
  scoreboard.push({ name, score });
  scoreboard.sort((a, b) => b.score - a.score);
  if (scoreboard.length > 10) scoreboard.length = 10; // keep top 10
  saveScoreboard();
  window._scoreSubmittedForThisGame = true;
  hideNameInput();
  drawScoreboard();
  showPlayAgainButton();
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawBackgroundCircles();
  drawCircles();
  drawProjectiles();

  // Draw shooters
  for (let i = 0; i < shooters.length; i++) {
    const shooter = shooters[i];
    ctx.fillStyle = shooter.color;
    ctx.fillRect(shooter.x - shooter.size/2, shooter.y - shooter.size/2, shooter.size, shooter.size);
    if (shooterBullets[i]) {
      ctx.fillStyle = '#a020f0';
      ctx.fillRect(
        shooterBullets[i].x - shooterBullets[i].size/2,
        shooterBullets[i].y - shooterBullets[i].size,
        shooterBullets[i].size,
        shooterBullets[i].size * 2
      );
    }
  }

  // HUD
  ctx.save();
  ctx.font = 'bold 2.2em Arial';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = 0.92;
  ctx.fillText(`Score: ${score}`, WIDTH - 32, 24);
  ctx.textAlign = 'left';
  ctx.fillText(`Time: ${levelTimer}s`, 32, 24);
  ctx.restore();

  // Game Over state
  if (gameOver) {
    stopLevelTimer();
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 4em Arial';
    ctx.fillText('Game Over', WIDTH/2, HEIGHT/2 - 60);
    ctx.font = '2em Arial';
    ctx.fillText(`Score: ${score}`, WIDTH/2, HEIGHT/2 - 10);
    // Draw scoreboard below score
    ctx.font = 'bold 2em Arial';
    ctx.fillText('Top 10 Scores', WIDTH/2, HEIGHT/2 + 40);
    ctx.font = '1.5em Arial';
    for (let i = 0; i < scoreboard.length; i++) {
      const entry = scoreboard[i];
      ctx.fillText(
        `${i + 1}. ${entry.name}: ${entry.score}`,
        WIDTH/2,
        HEIGHT/2 + 80 + i * 30
      );
    }
    ctx.restore();
    // Show name input only if not already submitted for this game over
    if (!nameInputElement && !window._scoreSubmittedForThisGame) {
      showNameInput();
    }
    showPlayAgainButton();
    return;
  }

  // Immune blinking
  if (triangleImmune) {
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 100);
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(triangleX, triangleY - triangleHeight/2);
    ctx.lineTo(triangleX - triangleWidth/2, triangleY + triangleHeight/2);
    ctx.lineTo(triangleX + triangleWidth/2, triangleY + triangleHeight/2);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // Draw triangle
  ctx.fillStyle = '#0078ff';
  ctx.beginPath();
  ctx.moveTo(triangleX, triangleY - triangleHeight/2);
  ctx.lineTo(triangleX - triangleWidth/2, triangleY + triangleHeight/2);
  ctx.lineTo(triangleX + triangleWidth/2, triangleY + triangleHeight/2);
  ctx.closePath();
  ctx.fill();
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

// —— Start everything ——
loadScoreboard();
spawnBackgroundCircles();
spawnCircles();
spawnShooters();
startLevelTimer();
requestAnimationFrame(gameLoop);
