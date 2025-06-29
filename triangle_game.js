// triangle_game.js

// Prevent zoom on mobile for better UI consistency
(function preventMobileZoom() {
  const meta = document.createElement('meta');
  meta.name = 'viewport';
  meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
  document.head.appendChild(meta);
})();

// —— Globals ——
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let WIDTH, HEIGHT;

let triangleWidth  = 60;
let triangleHeight = 80;
let triangleSpeed  = 6;
let triangleX, triangleY;

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

// Mobile shoot button
let mobBtn = null;
let mobBtnRect = null;

// —— Utility & Resize Helpers ——

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  WIDTH  = window.innerWidth;
  HEIGHT = window.innerHeight;
  canvas.style.width  = WIDTH + 'px';
  canvas.style.height = HEIGHT + 'px';
  canvas.width  = WIDTH  * dpr;
  canvas.height = HEIGHT * dpr;
  ctx.scale(dpr, dpr);
  // Center triangle if first init
  if (triangleX == null) {
    triangleX = WIDTH / 2;
    triangleY = HEIGHT / 2;
  }
}

function isTouchDevice() {
  return ('ontouchstart' in window)
      || (navigator.maxTouchPoints || 0) > 0
      || /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(navigator.userAgent);
}

function updateMobBtnRect() {
  if (!mobBtn) return;
  const rect = mobBtn.getBoundingClientRect();
  mobBtnRect = {
    left:   rect.left,
    top:    rect.top,
    right:  rect.right,
    bottom: rect.bottom
  };
}

// —— Mobile Shoot Button ——

function createMobileShootButton() {
  if (mobBtn) return;
  mobBtn = document.createElement('button');
  mobBtn.id = 'mobileShootBtn';
  mobBtn.innerText = 'FIRE';
  Object.assign(mobBtn.style, {
    position: 'fixed',
    right: '5vw',
    bottom: '7vh',
    width: '56px',
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
  const shoot = (e) => {
    e.preventDefault();
    projectiles.push({ x: triangleX, y: triangleY - triangleHeight/2 });
  };
  mobBtn.addEventListener('touchstart', shoot, { passive: false });
  mobBtn.addEventListener('mousedown', shoot);
  document.body.appendChild(mobBtn);
}

function updateMobileShootBtnVisibility() {
  if (!mobBtn) return;
  if (isTouchDevice()) {
    mobBtn.style.display    = 'block';
    // workaround iOS/Chrome reflow bug
    mobBtn.style.visibility = 'hidden';
    document.body.offsetHeight;
    mobBtn.style.visibility = 'visible';
    setTimeout(updateMobBtnRect, 100);
  } else {
    mobBtn.style.display = 'none';
    mobBtnRect = null;
  }
}

// —— Initialization & Reset ——

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

function resetGame() {
  resizeCanvas();
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
  updateMobileShootBtnVisibility();
}

window.addEventListener('resize', resetGame);

// —— Spawning ——

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

// —— Timer & Physics ——

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
}

function randomBetween(a, b) {
  return Math.random() * (b - a) + a;
}

// —— Input Handling ——

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
    if (y < triangleY - triangleHeight/2) projectiles.push({ x: triangleX, y: triangleY - triangleHeight/2 });
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
  } else if (touchActive) {
    const dx = x - touchStartX;
    const dy = y - touchStartY;
    if (Math.hypot(dx, dy) > touchMoveThreshold) {
      triangleX += dx;
      triangleY += dy;
      touchStartX = x;
      touchStartY = y;
    }
  }
  triangleX = Math.max(triangleWidth/2, Math.min(WIDTH - triangleWidth/2, triangleX));
  triangleY = Math.max(triangleHeight/2, Math.min(HEIGHT - triangleHeight/2, triangleY));
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', () => { draggingTriangle = false; touchActive = false; });

document.addEventListener('keydown', e => {
  if (gameOver && (e.key === 'r' || e.key === 'R')) {
    if (nameInputElement && document.activeElement === nameInputElement) return;
    resetGame(); return;
  }
  keys[e.key.toLowerCase()] = true;
  if (!gameOver && e.code === 'Space') projectiles.push({ x: triangleX, y: triangleY - triangleHeight/2 });
});
document.addEventListener('keyup',   e => { keys[e.key.toLowerCase()] = false; });

// —— Collision & Update ——

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
      if (Math.hypot(p.x - c.x, (p.y+8) - c.y) < c.r + 8) {
        c.hits++;
        projectiles.splice(j, 1);
        if (c.hits >= c.maxHits) {
          circles.splice(i, 1);
          score++;
          if (!circles.length) pendingLevelClearImmunity = true;
        }
        break;
      }
    }
  }
}

function updateCircles() {
  circles.forEach(c => {
    c.x += c.vx; c.y += c.vy;
    if (c.x - c.r < 0 || c.x + c.r > WIDTH)  c.vx *= -1;
    if (c.y - c.r < 0 || c.y + c.r > HEIGHT) c.vy *= -1;
  });
}

function update() {
  shooters.forEach((sh, i) => {
    if (!shooterBullets[i] && Date.now() > sh.nextShot) {
      shooterBullets[i] = { x: sh.x, y: sh.y+sh.size/2, vy:4, size:16 };
      sh.nextShot = Date.now() + 5000;
    }
    const b = shooterBullets[i];
    if (b) {
      b.y += b.vy;
      if (!triangleImmune && b.x > triangleX - triangleWidth/2 && b.x < triangleX + triangleWidth/2 &&
          b.y + b.size/2 > triangleY - triangleHeight/2 && b.y - b.size/2 < triangleY + triangleHeight/2) {
        gameOver = true;
      }
      if (b.y - b.size > HEIGHT) shooterBullets[i] = null;
    }
  });

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
    ctx.arc(c.x, c.y, c.r, 0, 2*Math.PI);
    ctx.fill();
  });
}

function drawCircles() {
  circles.forEach(c => {
    if (mobBtnRect && isTouchDevice()) {
      const scaleX = canvas.width/canvas.offsetWidth;
      const scaleY = canvas.height/canvas.offsetHeight;
      const sx = c.x/scaleX, sy = c.y/scaleY, r=c.r/scaleX;
      if (sx+r>mobBtnRect.left && sx-r<mobBtnRect.right && sy+r>mobBtnRect.top && sy-r<mobBtnRect.bottom) return;
    }
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x-c.r, c.y-c.r, c.r*2, c.r*2);
  });
}

function drawProjectiles() {
  projectiles.forEach(p => {
    ctx.fillStyle='#00ff44';
    ctx.fillRect(p.x-4, p.y-16,8,16);
  });
}

function drawScoreboard() {
  ctx.save();
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,WIDTH,HEIGHT);
  ctx.fillStyle='#000'; ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.font='bold 2em Arial'; ctx.fillText('Top 10 Scores', WIDTH/2, HEIGHT/2-80);
  ctx.font='1.5em Arial';
  scoreboard.forEach((e,i)=>{
    ctx.fillText(`${i+1}. ${e.name}: ${e.score}`, WIDTH/2, HEIGHT/2-40+i*30);
  });
  ctx.restore();
}

function showPlayAgainButton() {
  if (document.getElementById('playAgainBtn')) return;
  const btn=document.createElement('button');
  btn.id='playAgainBtn'; btn.innerText='Play Again';
  Object.assign(btn.style,{position:'fixed',left:'50%',top:'80%',transform:'translate(-50%,-50%)',fontSize:'2em',padding:'16px 32px',borderRadius:'8px',background:'#0078ff',color:'#fff',border:'none',cursor:'pointer',zIndex:2000});
  btn.onclick=resetGame;
  document.body.appendChild(btn);
}

function hidePlayAgainButton() {
  const b=document.getElementById('playAgainBtn'); if(b) b.remove();
}

function showNameInput() {
  if (nameInputElement) return;
  const wrapper=document.createElement('div'); wrapper.id='nameInputWrapper';
  const isMobile = isTouchDevice() || window.innerWidth<=600;
  Object.assign(wrapper.style,{position:'fixed',left:'50%',top:isMobile?'18%':'45%',transform:'translate(-50%,-50%)',zIndex:2001,display:'flex',flexDirection:isMobile?'column':'row',alignItems:'center',background:'rgba(255,255,255,0.97)',padding:isMobile?'8px':'12px 24px',borderRadius:'12px',boxShadow:'0 2px 12px #0003',gap:'8px'});
  nameInputElement=document.createElement('input');
  nameInputElement.type='text'; nameInputElement.maxLength=12; nameInputElement.placeholder='Enter your name';
  Object.assign(nameInputElement.style,{fontSize:isMobile?'1.1em':'2em',padding:'8px 16px',borderRadius:'8px',border:'2px solid #0078ff',outline:'none',textAlign:'center',background:'#fff',color:'#0078ff',marginRight:isMobile?'0':'12px',marginBottom:isMobile?'8px':'0',width:isMobile?'140px':'auto'});
  const submitBtn=document.createElement('button'); submitBtn.innerText='Submit';
  Object.assign(submitBtn.style,{fontSize:isMobile?'1em':'1.3em',padding:'8px 20px',borderRadius:'8px',background:'#0078ff',color:'#fff',border:'none',cursor:'pointer',height:'48px'});
  const doSubmit=()=>{
    const name=nameInputElement.value.trim()||'Anonymous';
    document.getElementById('nameInputWrapper').remove(); nameInputElement=null; submitScore(name);
  };
  submitBtn.onclick=doSubmit;
  nameInputElement.addEventListener('keydown',e=>{if(e.key==='Enter') doSubmit();});
  wrapper.append(nameInputElement,submitBtn);
  document.body.appendChild(wrapper);
  nameInputElement.focus();
}

function hideNameInput() {
  const w=document.getElementById('nameInputWrapper'); if(w) w.remove(); nameInputElement=null;
}

function submitScore(name) {
  scoreboard.push({name,score});
  scoreboard.sort((a,b)=>b.score-a.score);
  if(scoreboard.length>10) scoreboard.length=10;
  saveScoreboard();
  window._scoreSubmittedForThisGame=true;
  hideNameInput();
  drawScoreboard();
  showPlayAgainButton();
}

function draw() {
  ctx.fillStyle='#000'; ctx.fillRect(0,0,WIDTH,HEIGHT);
  drawBackgroundCircles();
  drawCircles();
  drawProjectiles();
  shooters.forEach((sh,i)=>{
    ctx.fillStyle=sh.color;
    ctx.fillRect(sh.x - sh.size/2, sh.y - sh.size/2, sh.size, sh.size);
    const b=shooterBullets[i];
    if(b){
      ctx.fillStyle='#a020f0';
      ctx.fillRect(b.x - b.size/2, b.y - b.size, b.size, b.size*2);
    }
  });
  ctx.save();
  ctx.font='bold 2.2em Arial'; ctx.textAlign='right'; ctx.textBaseline='top'; ctx.fillStyle='#fff'; ctx.globalAlpha=0.92;
  ctx.fillText(`Score: ${score}`, WIDTH-32,24);
  ctx.textAlign='left'; ctx.fillText(`Time: ${levelTimer}s`, 32,24);
  ctx.restore();
  if(gameOver){
    stopLevelTimer();
    ctx.save(); ctx.globalAlpha=1; ctx.fillStyle='#fff'; ctx.fillRect(0,0,WIDTH,HEIGHT);
    ctx.fillStyle='#000'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font='bold 4em Arial'; ctx.fillText('Game Over', WIDTH/2,HEIGHT/2-60);
    ctx.font='2em Arial'; ctx.fillText(`Score: ${score}`, WIDTH/2,HEIGHT/2-10);
    ctx.font='bold 2em Arial'; ctx.fillText('Top 10 Scores', WIDTH/2,HEIGHT/2+40);
    ctx.font='1.5em Arial'; scoreboard.forEach((e,i)=>{
      ctx.fillText(`${i+1}. ${e.name}: ${e.score}`, WIDTH/2,HEIGHT/2+80+i*30);
    }); ctx.restore();
    if(!nameInputElement && !window._scoreSubmittedForThisGame) showNameInput();
    showPlayAgainButton(); return;
  }
  if(triangleImmune){
    ctx.save(); ctx.globalAlpha=0.5+0.5*Math.sin(Date.now()/100); ctx.strokeStyle='#00ffcc'; ctx.lineWidth=8;
    ctx.beginPath();
    ctx.moveTo(triangleX,triangleY-triangleHeight/2);
    ctx.lineTo(triangleX-triangleWidth/2,triangleY+triangleHeight/2);
    ctx.lineTo(triangleX+triangleWidth/2,triangleY+triangleHeight/2);
    ctx.closePath();
    ctx.stroke(); ctx.restore();
  }
  ctx.fillStyle='#0078ff'; ctx.beginPath(); ctx.moveTo(triangleX,triangleY-triangleHeight/2);
  ctx.lineTo(triangleX-triangleWidth/2,triangleY+triangleHeight/2);
  ctx.lineTo(triangleX+triangleWidth/2,triangleY+triangleHeight/2);
  ctx.closePath(); ctx.fill();
}

function gameLoop() { update(); draw(); requestAnimationFrame(gameLoop); }

// —— Start everything ——
loadScoreboard();
resizeCanvas();
createMobileShootButton();
updateMobileShootBtnVisibility();
resetGame();
startLevelTimer();
requestAnimationFrame(gameLoop);
