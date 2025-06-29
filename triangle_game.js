// triangle_game.js

(function() {
  // —— Prevent zoom & overscroll ——  
  function preventMobileZoom() {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    meta.content = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';
  }

  // —— Force full‐screen canvas, no scroll ——  
  function fixBodyFullScreen() {
    Object.assign(document.documentElement.style, {
      height: '100%', width: '100%', margin: '0', overflow: 'hidden'
    });
    Object.assign(document.body.style, {
      height: '100%', width: '100%', margin: '0', overflow: 'hidden'
    });
  }

  // —— Globals ——  
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  // these BASE values will be multiplied by `scale`
  const BASE = {
    triW:  60,    triH: 80,    triSpeed: 6,
    projW: 8,     projH: 16,   projSpeed: 12,
    smallCount: 20, midCount:20, bigCount:3,
    shooterSize: 40, bulletSize:16, bulletSpeed:4,
    timer: 40
  };

  let scale = 1;
  let WIDTH, HEIGHT;

  let triangleWidth, triangleHeight, triangleSpeed;
  let projectileWidth, projectileHeight, projectileSpeed;
  let shooterSize, shooterBulletSize, shooterBulletSpeed;

  let triangleX = null, triangleY = null;
  let projectiles = [];
  let circles     = [];
  let backgroundCircles = [];

  let shooters       = [];
  let shooterBullets = [];

  let score    = 0;
  let gameOver = false;

  let levelTimer = BASE.timer;
  let levelTimerInterval = null;

  let scoreboard = [];
  let nameInputElement = null;
  const SCOREBOARD_KEY = 'triangleGameScoreboard';

  let triangleImmune = false, triangleImmuneTimeout = null, pendingLevelClearImmunity = false;

  const keys = {};
  const touchMoveThreshold = 10;
  let touchActive = false, touchStartX = 0, touchStartY = 0;
  let draggingTriangle = false, dragOffsetX = 0, dragOffsetY = 0;

  let mobBtn = null, mobBtnRect = null;

  // —— Responsive Resize ——  
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    WIDTH  = window.innerWidth;
    HEIGHT = window.innerHeight;
    canvas.style.width  = WIDTH + 'px';
    canvas.style.height = HEIGHT + 'px';
    canvas.width  = WIDTH  * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(1,0,0,1,0,0); // reset transform before scaling
    ctx.scale(dpr, dpr);

    // compute scale so that layout designed for 800×600 fits entirely on any screen, but never upscales above 1
    scale = Math.min(WIDTH / 800, HEIGHT / 600, 1);

    // recalc all sizes
    triangleWidth      = BASE.triW * scale;
    triangleHeight     = BASE.triH * scale;
    triangleSpeed      = BASE.triSpeed * scale;
    projectileWidth    = BASE.projW * scale;
    projectileHeight   = BASE.projH * scale;
    projectileSpeed    = BASE.projSpeed * scale;
    shooterSize        = BASE.shooterSize * scale;
    shooterBulletSize  = BASE.bulletSize * scale;
    shooterBulletSpeed = BASE.bulletSpeed * scale;

    // recenter triangle first time
    if (triangleX === null) {
      triangleX = WIDTH / 2;
      triangleY = HEIGHT / 2;
    } else {
      // clamp to new bounds
      triangleX = Math.max(triangleWidth/2, Math.min(WIDTH - triangleWidth/2, triangleX));
      triangleY = Math.max(triangleHeight/2, Math.min(HEIGHT - triangleHeight/2, triangleY));
    }
    // update mobile button if present
    updateMobileShootBtnVisibility();
  }

  function isTouchDevice() {
    return 'ontouchstart' in window
        || (navigator.maxTouchPoints || 0) > 0
        || /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(navigator.userAgent);
  }

  function updateMobBtnRect() {
    if (!mobBtn) return;
    const r = mobBtn.getBoundingClientRect();
    mobBtnRect = { left:r.left, top:r.top, right:r.right, bottom:r.bottom };
  }

  // —— Mobile FIRE button ——  
  function createMobileShootButton() {
    if (mobBtn) return;
    mobBtn = document.createElement('button');
    mobBtn.id = 'mobileShootBtn';
    mobBtn.innerText = 'FIRE';
    Object.assign(mobBtn.style, {
      position: 'fixed',
      right: `${5 * scale}vw`,
      bottom: `${7 * scale}vh`,
      width: `${56*scale}px`,
      height: `${56*scale}px`,
      fontSize: `${16*scale}px`,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #ff2222 60%, #ff8800 100%)',
      color: '#fff',
      border: 'none',
      boxShadow: '0 2px 8px #0006',
      zIndex: 3000,
      display: 'none',
      userSelect: 'none',
      touchAction: 'none',
      opacity: 0.97,
      lineHeight: `${56*scale}px`,
      textAlign: 'center',
      fontWeight: 'bold',
      letterSpacing: '1px',
    });
    const shoot = e => {
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
      mobBtn.style.display = 'block';
      mobBtn.style.visibility = 'hidden';
      document.body.offsetHeight;
      mobBtn.style.visibility = 'visible';
      setTimeout(updateMobBtnRect, 100);
    } else {
      mobBtn.style.display = 'none';
      mobBtnRect = null;
    }
  }

  // —— Persistence ——  
  function loadScoreboard() {
    try {
      scoreboard = JSON.parse(localStorage.getItem(SCOREBOARD_KEY)) || [];
    } catch {
      scoreboard = [];
    }
  }
  function saveScoreboard() {
    try {
      localStorage.setItem(SCOREBOARD_KEY, JSON.stringify(scoreboard));
    } catch {}
  }

  // —— Game Reset & Init ——  
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
    triangleImmuneTimeout = setTimeout(() => triangleImmune = false, 3000*scale);
    startLevelTimer();
    hidePlayAgainButton();
    hideNameInput();
    updateMobileShootBtnVisibility();
  }
  window.addEventListener('resize', () => resetGame());

  // —— Spawning ——  
  function spawnBackgroundCircles() {
    backgroundCircles = [];
    const numStars = Math.floor(WIDTH * HEIGHT / (1200 * scale));
    for (let i = 0; i < numStars; i++) {
      const r = Math.random() < 0.7
        ? randomBetween(0.5, 1.5) * scale
        : randomBetween(1.5, 2.5) * scale;
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
    // small
    for (let i = 0; i < BASE.smallCount; i++) {
      if (Math.random() < 0.25) {
        const r = triRad/2;
        const vx = (Math.random()<0.5?-1:1)*randomBetween(1.5,3.5)*scale;
        const vy = Math.random()<0.65
          ? (Math.random()<0.5?-1:1)*randomBetween(1,2.5)*scale
          : 0;
        circles.push({ x: randomBetween(r, WIDTH-r),
                       y: randomBetween(r, HEIGHT-r),
                       r, hits:0, maxHits:1, color:'#ff2222', vx, vy });
      }
    }
    // mid
    for (let i = 0; i < BASE.midCount; i++) {
      if (Math.random() < 0.5) {
        const r = triRad;
        const vx = (Math.random()<0.5?-1:1)*randomBetween(1,2.5)*scale;
        const vy = Math.random()<0.65
          ? (Math.random()<0.5?-1:1)*randomBetween(0.7,2)*scale
          : 0;
        circles.push({ x: randomBetween(r, WIDTH-r),
                       y: randomBetween(r, HEIGHT-r),
                       r, hits:0, maxHits:5, color:'#ff2222', vx, vy });
      }
    }
    // big
    for (let i=0;i<BASE.bigCount;i++){
      if (Math.random()<0.25){
        const r = triRad*2;
        let x,y,ok,tries=0;
        do {
          x = randomBetween(r, WIDTH-r);
          y = randomBetween(r, HEIGHT-r);
          ok = !circles.some(c=>Math.hypot(x-c.x,y-c.y)<c.r+r+4);
          tries++;
        } while(!ok && tries<100);
        const vx = (Math.random()<0.5?-1:1)*randomBetween(0.5,1.5)*scale;
        const vy = Math.random()<0.65
          ? (Math.random()<0.5?-1:1)*randomBetween(0.3,1)*scale
          : 0;
        circles.push({ x,y,r,hits:0,maxHits:10,color:'#ff2222',vx,vy });
      }
    }
    circles.forEach(c=>{
      c.vx = Math.sign(c.vx)*Math.min(Math.max(Math.abs(c.vx),0.5*scale),3.5*scale);
      if(c.vy!==0) c.vy = Math.sign(c.vy)*Math.min(Math.max(Math.abs(c.vy),0.3*scale),2.5*scale);
    });
  }

  function spawnShooters() {
    shooters = [];
    shooterBullets = [];
    const cols = 3, spacing = WIDTH/(cols+1);
    for (let i=0;i<cols;i++){
      shooters.push({
        x: spacing*(i+1),
        y: 60*scale,
        size: shooterSize,
        color: '#00ff44',
        nextShot: Date.now() + 5000*(1+Math.random())
      });
      shooterBullets.push(null);
    }
  }

  // —— Timer & Physics ——  
  function startLevelTimer() {
    levelTimer = BASE.timer;
    clearInterval(levelTimerInterval);
    levelTimerInterval = setInterval(()=>{
      if(gameOver) return;
      levelTimer--;
      if(levelTimer<=0){
        levelTimer=0; gameOver=true; clearInterval(levelTimerInterval);
      }
    }, 1000);
  }
  function stopLevelTimer(){
    clearInterval(levelTimerInterval);
  }
  function randomBetween(a,b){
    return Math.random()*(b-a)+a;
  }

  // —— Input Handling ——  
  canvas.addEventListener('mousedown', e=>{
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX-r.left, my = e.clientY-r.top;
    if(mx>=triangleX-triangleWidth/2&&mx<=triangleX+triangleWidth/2 &&
       my>=triangleY-triangleHeight/2&&my<=triangleY+triangleHeight/2){
      draggingTriangle=true;
      dragOffsetX=mx-triangleX;
      dragOffsetY=my-triangleY;
    }
  });
  canvas.addEventListener('mousemove', e=>{
    if(!draggingTriangle) return;
    const r=canvas.getBoundingClientRect();
    triangleX = e.clientX-r.left - dragOffsetX;
    triangleY = e.clientY-r.top  - dragOffsetY;
    triangleX = Math.max(triangleWidth/2,Math.min(WIDTH-triangleWidth/2,triangleX));
    triangleY = Math.max(triangleHeight/2,Math.min(HEIGHT-triangleHeight/2,triangleY));
  });
  ['mouseup','mouseleave'].forEach(evt=>
    canvas.addEventListener(evt,()=>draggingTriangle=false)
  );

  canvas.addEventListener('touchstart', e=>{
    const r=canvas.getBoundingClientRect();
    const t=e.touches[0];
    const x=t.clientX-r.left, y=t.clientY-r.top;
    if(x>=triangleX-triangleWidth/2&&x<=triangleX+triangleWidth/2 &&
       y>=triangleY-triangleHeight/2&&y<=triangleY+triangleHeight/2){
      draggingTriangle=true;
      dragOffsetX=x-triangleX; dragOffsetY=y-triangleY;
    } else {
      touchActive=true; touchStartX=x; touchStartY=y;
      if(y<triangleY-triangleHeight/2) projectiles.push({x:triangleX,y:triangleY-triangleHeight/2});
    }
    e.preventDefault();
  }, { passive:false });

  canvas.addEventListener('touchmove', e=>{
    const r=canvas.getBoundingClientRect();
    const t=e.touches[0];
    const x=t.clientX-r.left, y=t.clientY-r.top;
    if(draggingTriangle){
      triangleX=x-dragOffsetX; triangleY=y-dragOffsetY;
    } else if(touchActive){
      const dx=x-touchStartX, dy=y-touchStartY;
      if(Math.hypot(dx,dy)>touchMoveThreshold){
        triangleX+=dx; triangleY+=dy;
        touchStartX=x; touchStartY=y;
      }
    }
    triangleX=Math.max(triangleWidth/2,Math.min(WIDTH-triangleWidth/2,triangleX));
    triangleY=Math.max(triangleHeight/2,Math.min(HEIGHT-triangleHeight/2,triangleY));
    e.preventDefault();
  }, { passive:false });

  canvas.addEventListener('touchend', ()=>{ draggingTriangle=false; touchActive=false; });

  document.addEventListener('keydown', e=>{
    if(gameOver && (e.key==='r'||e.key==='R')){
      if(nameInputElement && document.activeElement===nameInputElement) return;
      resetGame(); return;
    }
    keys[e.key.toLowerCase()] = true;
    if(!gameOver && e.code==='Space')
      projectiles.push({ x:triangleX, y:triangleY-triangleHeight/2 });
  });
  document.addEventListener('keyup', e=> keys[e.key.toLowerCase()]=false);

  // —— Collision & Update ——  
  function triangleSquareCollision(tx, ty, tw, th, sx, sy, sr) {
    const triL=tx-tw/2, triR=tx+tw/2;
    const triT=ty-th/2, triB=ty+th/2;
    const sqL=sx-sr, sqR=sx+sr;
    const sqT=sy-sr, sqB=sy+sr;
    return triL<sqR&&triR>sqL&&triT<sqB&&triB>sqT;
  }

  function updateProjectiles() {
    projectiles.forEach(p=> p.y -= projectileSpeed);
    projectiles = projectiles.filter(p=>p.y > -projectileHeight);
    for(let i=circles.length-1;i>=0;i--){
      const c=circles[i];
      for(let j=projectiles.length-1;j>=0;j--){
        const p=projectiles[j];
        if(Math.hypot(p.x-c.x,(p.y+projectileHeight/2)-c.y) < c.r + projectileWidth/2){
          c.hits++;
          projectiles.splice(j,1);
          if(c.hits>=c.maxHits){
            circles.splice(i,1);
            score++;
            if(!circles.length) pendingLevelClearImmunity=true;
          }
          break;
        }
      }
    }
  }

  function updateCircles() {
    circles.forEach(c => {
      c.x += c.vx; c.y += c.vy;
      if(c.x-c.r<0||c.x+c.r>WIDTH)  c.vx*=-1;
      if(c.y-c.r<0||c.y+c.r>HEIGHT) c.vy*=-1;
    });
  }

  function update() {
    shooters.forEach((sh,i)=>{
      if(!shooterBullets[i] && Date.now()>sh.nextShot){
        shooterBullets[i]={ x:sh.x, y:sh.y+sh.size/2, vy: shooterBulletSpeed, size: shooterBulletSize };
        sh.nextShot = Date.now() + 5000;
      }
      const b = shooterBullets[i];
      if(b){
        b.y += b.vy;
        if(!triangleImmune &&
           b.x>triangleX-triangleWidth/2 &&
           b.x<triangleX+triangleWidth/2 &&
           b.y+b.size/2>triangleY-triangleHeight/2 &&
           b.y-b.size/2<triangleY+triangleHeight/2) {
          gameOver=true;
        }
        if(b.y - b.size > HEIGHT) shooterBullets[i]=null;
      }
    });

    if(gameOver) return;

    updateProjectiles();
    updateCircles();

    if(keys['a']) triangleX -= triangleSpeed;
    if(keys['d']) triangleX += triangleSpeed;
    if(keys['w']) triangleY -= triangleSpeed;
    if(keys['s']) triangleY += triangleSpeed;

    triangleX = Math.max(triangleWidth/2,Math.min(WIDTH-triangleWidth/2,triangleX));
    triangleY = Math.max(triangleHeight/2,Math.min(HEIGHT-triangleHeight/2,triangleY));

    if(!triangleImmune){
      for(const c of circles){
        if(triangleSquareCollision(triangleX,triangleY,triangleWidth,triangleHeight,c.x,c.y,c.r)){
          gameOver=true; break;
        }
      }
    }

    if(pendingLevelClearImmunity){
      spawnBackgroundCircles();
      spawnCircles();
      spawnShooters();
      triangleImmune = true;
      clearTimeout(triangleImmuneTimeout);
      triangleImmuneTimeout = setTimeout(()=>triangleImmune=false,2000*scale);
      pendingLevelClearImmunity=false;
      startLevelTimer();
    }
  }

  // —— Rendering ——  
  function drawBackgroundCircles() {
    backgroundCircles.forEach(c=>{
      ctx.fillStyle=c.color;
      ctx.beginPath();
      ctx.arc(c.x,c.y,c.r,0,2*Math.PI);
      ctx.fill();
    });
  }

  function drawCircles() {
    circles.forEach(c=>{
      if(mobBtnRect&&isTouchDevice()){
        const sx=c.x/(canvas.width/canvas.offsetWidth),
              sy=c.y/(canvas.height/canvas.offsetHeight),
              r=c.r/(canvas.width/canvas.offsetWidth);
        if(sx+r>mobBtnRect.left&&sx-r<mobBtnRect.right&&sy+r>mobBtnRect.top&&sy-r<mobBtnRect.bottom)
          return;
      }
      ctx.fillStyle=c.color;
      ctx.fillRect(c.x-c.r,c.y-c.r,c.r*2,c.r*2);
    });
  }

  function drawProjectiles() {
    projectiles.forEach(p=>{
      ctx.fillStyle='#00ff44';
      // Correct bullet drawing: use width and height, not coordinates as x2/y2
      ctx.fillRect(p.x - projectileWidth/2, p.y - projectileHeight, projectileWidth, projectileHeight);
    });
  }

  function drawScoreboard() {
    ctx.save();
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,WIDTH,HEIGHT);
    ctx.fillStyle='#000'; ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.font = `${24*scale}px Arial`; ctx.fillText('Top 10 Scores', WIDTH/2, HEIGHT/2-80*scale);
    ctx.font = `${18*scale}px Arial`;
    scoreboard.forEach((e,i)=>{
      ctx.fillText(`${i+1}. ${e.name}: ${e.score}`, WIDTH/2, HEIGHT/2-40*scale + i*30*scale);
    });
    ctx.restore();
  }

  function showPlayAgainButton() {
    if(document.getElementById('playAgainBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'playAgainBtn';
    btn.innerText = 'Play Again';
    Object.assign(btn.style, {
      position: 'fixed',
      left: '50%',
      top: `${80*scale}%`,
      transform: 'translate(-50%,-50%)',
      fontSize: `${16*scale}px`,
      padding: `${12*scale}px ${24*scale}px`,
      borderRadius: `${8*scale}px`,
      background: '#0078ff',
      color: '#fff',
      border: 'none',
      cursor: 'pointer',
      zIndex: 2000
    });
    btn.onclick = resetGame;
    document.body.appendChild(btn);
  }
  function hidePlayAgainButton() {
    const b=document.getElementById('playAgainBtn');
    if(b) b.remove();
  }

  function showNameInput() {
    if(nameInputElement) return;
    const wrapper=document.createElement('div');
    wrapper.id='nameInputWrapper';
    const isMobile = isTouchDevice() || WIDTH < 600;
    Object.assign(wrapper.style, {
      position: 'fixed',
      left: '50%',
      top: isMobile? '18%':'45%',
      transform: 'translate(-50%,-50%)',
      zIndex: 2001,
      display: 'flex',
      flexDirection: isMobile?'column':'row',
      alignItems: 'center',
      background: 'rgba(255,255,255,0.97)',
      padding: isMobile? `${8*scale}px`:`${12*scale}px ${24*scale}px`,
      borderRadius: `${12*scale}px`,
      boxShadow: '0 2px 12px #0003',
      gap: `${8*scale}px`
    });

    nameInputElement = document.createElement('input');
    nameInputElement.type='text';
    nameInputElement.maxLength=12;
    nameInputElement.placeholder='Enter your name';
    Object.assign(nameInputElement.style, {
      fontSize: `${16*scale}px`,
      padding: `${8*scale}px ${16*scale}px`,
      borderRadius:`${8*scale}px`,
      border:`2px solid #0078ff`,
      outline:'none',
      textAlign:'center',
      background:'#fff',
      color:'#0078ff',
      marginRight: isMobile? '0': `${12*scale}px`,
      marginBottom: isMobile? `${8*scale}px`:'0',
      width: isMobile? `${140*scale}px`:'auto'
    });

    const submitBtn = document.createElement('button');
    submitBtn.innerText='Submit';
    Object.assign(submitBtn.style, {
      fontSize: `${16*scale}px`,
      padding: `${8*scale}px ${20*scale}px`,
      borderRadius:`${8*scale}px`,
      background:'#0078ff',
      color:'#fff',
      border:'none',
      cursor:'pointer',
      height: `${48*scale}px`
    });

    const doSubmit = () => {
      const name = nameInputElement.value.trim() || 'Anonymous';
      document.getElementById('nameInputWrapper').remove();
      nameInputElement = null;
      submitScore(name);
    };

    submitBtn.onclick = doSubmit;
    nameInputElement.addEventListener('keydown', e=>{ if(e.key==='Enter') doSubmit(); });

    wrapper.append(nameInputElement, submitBtn);
    document.body.appendChild(wrapper);
    nameInputElement.focus();
  }
  function hideNameInput() {
    const w=document.getElementById('nameInputWrapper');
    if(w) w.remove();
    nameInputElement = null;
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
    ctx.fillStyle='#000';
    ctx.fillRect(0,0,WIDTH,HEIGHT);
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
    ctx.font = `bold ${20*scale}px Arial`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.92;
    ctx.fillText(`Score: ${score}`, WIDTH - 32*scale, 24*scale);
    ctx.textAlign = 'left';
    ctx.fillText(`Time: ${levelTimer}s`, 32*scale, 24*scale);
    ctx.restore();

    if(gameOver){
      stopLevelTimer();
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0,0,WIDTH,HEIGHT);
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${48*scale}px Arial`;
      ctx.fillText('Game Over', WIDTH/2, HEIGHT/2 - 60*scale);
      ctx.font = `${24*scale}px Arial`;
      ctx.fillText(`Score: ${score}`, WIDTH/2, HEIGHT/2 - 10*scale);
      ctx.font = `bold ${24*scale}px Arial`;
      ctx.fillText('Top 10 Scores', WIDTH/2, HEIGHT/2 + 40*scale);
      ctx.font = `${18*scale}px Arial`;
      scoreboard.forEach((e,i)=>{
        ctx.fillText(`${i+1}. ${e.name}: ${e.score}`, WIDTH/2, HEIGHT/2 + (80 + 30*i)*scale);
      });
      ctx.restore();
      if(!nameInputElement && !window._scoreSubmittedForThisGame) showNameInput();
      showPlayAgainButton();
      return;
    }

    if(triangleImmune){
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5*Math.sin(Date.now()/100);
      ctx.strokeStyle = '#00ffcc';
      ctx.lineWidth   = 8*scale;
      ctx.beginPath();
      ctx.moveTo(triangleX, triangleY - triangleHeight/2);
      ctx.lineTo(triangleX - triangleWidth/2, triangleY + triangleHeight/2);
      ctx.lineTo(triangleX + triangleWidth/2, triangleY + triangleHeight/2);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

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

  // —— Bootstrap ——  
  document.addEventListener('DOMContentLoaded', () => {
    preventMobileZoom();
    fixBodyFullScreen();
    loadScoreboard();
    resizeCanvas();
    createMobileShootButton();
    updateMobileShootBtnVisibility();
    resetGame();
    startLevelTimer();
    requestAnimationFrame(gameLoop);
  });

})();
