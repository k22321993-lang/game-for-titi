(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const screens = ['menuScreen','gameScreen','resultScreen','secretScreen'];
  const show = id => screens.forEach(s => $(s).classList.toggle('hidden', s !== id));
  const scoreEl = $('score'), bestEl = $('best'), recordText = $('recordText');
  const TARGET_SCORE = 2000;
  const LANES = [1/6, 1/2, 5/6];
  let score = 0, best = 0, lane = 1, running = false, paused = false;
  let raf = 0, countdownTimer = 0, resultTimer = 0, last = 0, spawn = 0;
  let speed = 250, objects = [], audioOn = false, audioCtx = null;
  let secretRaf = 0, heartParticles = [], gameEnded = false;

  try { best = Number(localStorage.getItem('neonRunBest') || 0) || 0; } catch (_) {}
  bestEl.textContent = recordText.textContent = String(best).padStart(4, '0');

  function tone(freq = 440, duration = .07, type = 'sine', volume = .025) {
    if (!audioOn) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = type; osc.frequency.value = freq; gain.gain.value = volume;
      osc.connect(gain); gain.connect(audioCtx.destination); osc.start();
      gain.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + duration);
      osc.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }

  $('soundBtn').addEventListener('click', () => {
    audioOn = !audioOn;
    $('soundLabel').textContent = audioOn ? 'SOUND ON' : 'SOUND OFF';
    $('soundBtn').style.color = audioOn ? 'var(--cyan)' : '';
    if (audioOn) tone(660, .12);
  });
  $('startBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', startGame);
  $('resumeBtn').addEventListener('click', resumeGame);
  $('pauseBtn').addEventListener('click', () => paused ? resumeGame() : pauseGame());
  $('replayBtn').addEventListener('click', () => { stopHeart(); clearTimeout(resultTimer); show('menuScreen'); });

  function startGame() {
    cancelAnimationFrame(raf);
    clearInterval(countdownTimer);
    clearTimeout(resultTimer);
    stopHeart();
    running = false; paused = false; gameEnded = false;
    score = 0; lane = 1; speed = 245; spawn = 0; last = 0; objects = [];
    $('obstacleLayer').innerHTML = '';
    $('collectLayer').innerHTML = '';
    scoreEl.textContent = '0000';
    bestEl.textContent = String(best).padStart(4, '0');
    $('pauseOverlay').classList.add('hidden');
    $('player').style.left = `calc(${LANES[lane] * 100}% - 32px)`;
    $('player').classList.remove('hit');
    show('gameScreen');
    const cd = $('countdown');
    cd.classList.remove('hidden');
    let n = 3;
    cd.textContent = n;
    countdownTimer = setInterval(() => {
      n--;
      if (n > 0) { cd.textContent = n; tone(360, .08); }
      else {
        clearInterval(countdownTimer);
        cd.textContent = 'GO!';
        tone(720, .12);
        setTimeout(() => cd.classList.add('hidden'), 280);
        running = true;
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    }, 650);
    $('gameArea').focus();
  }

  function pauseGame() {
    if (!running || gameEnded) return;
    paused = true;
    cancelAnimationFrame(raf);
    $('pauseOverlay').classList.remove('hidden');
  }
  function resumeGame() {
    if (!running || gameEnded) return;
    paused = false;
    $('pauseOverlay').classList.add('hidden');
    last = 0;
    raf = requestAnimationFrame(loop);
  }
  function move(direction) {
    if (!running || paused || gameEnded) return;
    lane = Math.max(0, Math.min(2, lane + direction));
    $('player').style.left = `calc(${LANES[lane] * 100}% - 32px)`;
    tone(240 + lane * 90, .035, 'triangle', .012);
  }

  document.addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') move(-1);
    if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') move(1);
    if (e.key === ' ' && running) paused ? resumeGame() : pauseGame();
  });
  $('gameArea').addEventListener('pointerdown', e => {
    if (!running || paused || gameEnded) return;
    const rect = $('gameArea').getBoundingClientRect();
    move(e.clientX < rect.left + rect.width / 2 ? -1 : 1);
  });

  function makeObject(kind) {
    const el = document.createElement('div');
    el.className = kind === 'obstacle' ? 'obstacle' : 'collectible';
    const objectLane = Math.floor(Math.random() * 3);
    el.dataset.lane = objectLane;
    el.style.left = `${LANES[objectLane] * 100}%`;
    el.style.top = '-55px';
    (kind === 'obstacle' ? $('obstacleLayer') : $('collectLayer')).appendChild(el);
    objects.push({ el, kind, lane: objectLane, y: -55, dead: false });
  }

  function loop(timestamp) {
    if (!running || paused || gameEnded) return;
    const dt = Math.min((timestamp - (last || timestamp)) / 1000, .035);
    last = timestamp;
    spawn += dt;
    speed = Math.min(390, speed + dt * 1.15);

    // Coins are frequent enough to make the 2000-point goal achievable.
    const interval = Math.max(.48, .78 - score / 9000);
    if (spawn >= interval) {
      spawn = 0;
      makeObject(Math.random() < .64 ? 'obstacle' : 'collectible');
    }

    const area = $('gameArea');
    const height = area.clientHeight;
    const playerY = height * .78;
    // Match the collision box to Patrick's actual CSS position (bottom: 8%).
    const playerTop = height - height * 0.08 - 94;
    const playerBottom = playerTop + 86;

    for (const obj of objects) {
      if (obj.dead) continue;
      obj.y += speed * dt;
      obj.el.style.top = `${obj.y}px`;

      const objectHeight = obj.kind === 'obstacle' ? 42 : 25;
      const objectTop = obj.y;
      const objectBottom = obj.y + objectHeight;
      const overlapsVertically = objectBottom >= playerTop && objectTop <= playerBottom;

      // Real collision: a hit immediately ends the run; it never grants the secret.
      if (overlapsVertically && obj.lane === lane) {
        if (obj.kind === 'obstacle') {
          obj.dead = true;
          obj.el.remove();
          $('player').classList.add('hit');
          tone(135, .22, 'sawtooth', .04);
          finishGame(false);
          return;
        }
        obj.dead = true;
        obj.el.remove();
        score = Math.min(TARGET_SCORE, score + 150);
        tone(850, .11, 'sine', .04);
        burst(area.clientWidth * LANES[lane], playerY);
        if (score >= TARGET_SCORE) {
          score = TARGET_SCORE;
          scoreEl.textContent = String(score).padStart(4, '0');
          finishGame(true);
          return;
        }
      }

      if (obj.y > height + 60) {
        obj.dead = true;
        obj.el.remove();
        if (obj.kind === 'obstacle') score += 15; // reward a successfully dodged obstacle
      }
    }
    objects = objects.filter(obj => !obj.dead);
    // Survival score is deliberately slow; reaching 2000 requires actually playing.
    score = Math.min(TARGET_SCORE, score + dt * 7);
    scoreEl.textContent = String(Math.floor(score)).padStart(4, '0');
    if (score >= TARGET_SCORE) {
      score = TARGET_SCORE;
      scoreEl.textContent = '2000';
      finishGame(true);
      return;
    }
    raf = requestAnimationFrame(loop);
  }

  function burst(x, y) {
    for (let i = 0; i < 10; i++) {
      const particle = document.createElement('i');
      particle.style.cssText = `position:absolute;z-index:5;left:${x}px;top:${y}px;width:4px;height:4px;border-radius:50%;background:var(--cyan);box-shadow:0 0 8px var(--cyan);pointer-events:none`;
      $('gameArea').appendChild(particle);
      const angle = Math.PI * 2 * i / 10;
      const dx = Math.cos(angle) * 38, dy = Math.sin(angle) * 38;
      particle.animate(
        [{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${dx}px,${dy}px)`, opacity: 0 }],
        { duration: 380, easing: 'ease-out' }
      ).onfinish = () => particle.remove();
    }
  }

  function finishGame(won) {
    if (gameEnded) return;
    gameEnded = true;
    running = false;
    paused = false;
    cancelAnimationFrame(raf);
    clearInterval(countdownTimer);
    $('pauseOverlay').classList.add('hidden');

    const finalScore = Math.floor(score);
    if (finalScore > best) {
      best = finalScore;
      try { localStorage.setItem('neonRunBest', String(best)); } catch (_) {}
    }
    $('finalScore').textContent = String(finalScore).padStart(4, '0');
    bestEl.textContent = recordText.textContent = String(best).padStart(4, '0');

    $('resultKicker').textContent = won ? 'CHALLENGE CLEARED' : 'RUN TERMINATED';
    $('resultTitle').textContent = won ? 'YOU WIN!' : 'GAME OVER';
    $('resultText').textContent = won
      ? '2000 POINTS REACHED. Your secret message is unlocking...'
      : 'Patrick hit an obstacle! Try again and reach 2000 points to unlock the message.';
    $('resultIcon').textContent = won ? '✦' : '×';
    $('againBtn').innerHTML = won ? 'PLAY AGAIN <b>↻</b>' : 'TRY AGAIN <b>↻</b>';
    const hint = document.querySelector('.result-screen .hint');
    if (hint) hint.textContent = won ? 'SECRET MESSAGE UNLOCKS AUTOMATICALLY' : 'THE SECRET MESSAGE STAYS LOCKED UNTIL YOU WIN';
    show('resultScreen');
    if (won) {
      tone(660, .12);
      setTimeout(() => tone(880, .14), 120);
      setTimeout(() => tone(1100, .22), 260);
      resultTimer = setTimeout(() => {
        if (gameEnded && !$('resultScreen').classList.contains('hidden')) showSecret();
      }, 2400);
    } else {
      tone(170, .2, 'square', .03);
    }
  }

  const canvas = $('heartCanvas');
  const ctx = canvas.getContext('2d');
  function heartPoint(t) {
    return {
      x: 16 * Math.pow(Math.sin(t), 3),
      y: -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t))
    };
  }
  function startHeart() {
    stopHeart();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = canvas.clientWidth, height = canvas.clientHeight;
    heartParticles = Array.from({ length: 240 }, () => {
      const t = Math.random() * Math.PI * 2, p = heartPoint(t);
      return {
        scale: .5 + Math.random() * 1.7, phase: Math.random() * 6.28,
        drift: Math.random() * Math.PI * 2, heart: Math.random() < .72,
        x: Math.random() * width, y: Math.random() * height, px: p.x, py: p.y
      };
    });
    const started = performance.now();
    function draw(now) {
      const time = (now - started) / 1000;
      ctx.clearRect(0, 0, width, height);
      for (const p of heartParticles) {
        let x, y;
        if (p.heart) {
          const scale = Math.min(width, height) * .018;
          const pulse = 1 + Math.sin(time * 2.5) * .035;
          x = width / 2 + p.px * scale * pulse + Math.sin(time + p.drift) * 5;
          y = height * .42 + p.py * scale * pulse + Math.cos(time * 1.3 + p.phase) * 4;
        } else {
          x = (p.x + Math.sin(time * .2 + p.drift) * 15 + width) % width;
          y = (p.y - time * (8 + p.scale * 9) + height * 2) % (height * 1.2);
        }
        const alpha = .25 + .65 * (.5 + .5 * Math.sin(time * 2 + p.phase));
        ctx.beginPath();
        ctx.fillStyle = p.heart
          ? `rgba(255,${70 + Math.floor(alpha * 90)},${150 + Math.floor(alpha * 80)},${alpha})`
          : `rgba(76,244,255,${alpha * .6})`;
        ctx.shadowBlur = p.heart ? 12 : 7;
        ctx.shadowColor = p.heart ? '#ff3d9a' : '#4cf4ff';
        ctx.arc(x, y, p.scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      secretRaf = requestAnimationFrame(draw);
    }
    secretRaf = requestAnimationFrame(draw);
  }
  function stopHeart() {
    cancelAnimationFrame(secretRaf);
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  function showSecret() {
    show('secretScreen');
    startHeart();
    tone(520, .18);
    setTimeout(() => tone(660, .2), 180);
    setTimeout(() => tone(880, .3), 380);
  }
})();
