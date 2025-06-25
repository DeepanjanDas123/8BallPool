// ===== MULTIPLAYER SOCKET.IO SETUP =====
const socket = io();
let roomId = null;
let playerNum = 1;
let myTurn = false;
let awaitingOpponentShot = false;
const statusDiv = document.getElementById('status');

const canvas = document.getElementById('poolCanvas');
const ctx = canvas.getContext('2d');

// ====== POOL GAME CONSTANTS ======
const TABLE_W = canvas.width;
const TABLE_H = canvas.height;
const WALL = 12;
const BALL_RADIUS = 13;
const CUE_BALL_RADIUS = 13;
const SPIN_UI_RADIUS = 32;
const POCKET_RADIUS = 23;
const FRICTION = 0.992;
const BALL_COUNT = 8;
const EPS = 0.01;

// Spin tuning
const MAX_SPIN = 7.0;
const SPIN_EFFECT_SIDE = 0.32;
const SPIN_EFFECT_VERTICAL = 0.30;
const SPIN_DAMPING = 0.97;

const pockets = [
    {x: WALL, y: WALL},
    {x: TABLE_W/2, y: WALL},
    {x: TABLE_W-WALL, y: WALL},
    {x: WALL, y: TABLE_H - WALL},
    {x: TABLE_W/2, y: TABLE_H - WALL},
    {x: TABLE_W-WALL, y: TABLE_H - WALL},
];

// ====== POOL GAME STATE ======
let balls = [];
let cueBall = {};
let scores = [0, 0];
let currentPlayer = 0;
let isAiming = false;
let aimStart = {x:0, y:0};
let aimEnd = {x:0, y:0};
let canShoot = true;
let moving = false;

// Spin state
let showSpinUI = false;
let spinSelect = {x:0, y:0};
let spinApplied = {x:0, y:0};
let spinSetting = false;

// UI elements
const turnSpan = document.getElementById('turn');
const scoreP1 = document.getElementById('scoreP1');
const scoreP2 = document.getElementById('scoreP2');
const winnerDiv = document.getElementById('winner');

// ====== GAME INIT ======
function resetBalls() {
    balls = [];
    let startX = TABLE_W - 220;
    let startY = TABLE_H/2;
    let idx = 1;
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col <= row; col++) {
            if (idx > BALL_COUNT) break;
            let x = startX + row * BALL_RADIUS * 2 * Math.cos(Math.PI/6);
            let y = startY + (col - row/2) * BALL_RADIUS * 2.1;
            balls.push({
                x, y,
                vx: 0, vy: 0,
                color: `hsl(${45*idx}, 80%, 55%)`,
                number: idx
            });
            idx++;
        }
    }
    cueBall = {
        x: 150,
        y: TABLE_H/2,
        vx: 0,
        vy: 0,
        color: "#fff",
        spinX: 0,
        spinY: 0
    };
    spinApplied = {x:0, y:0};
    showSpinUI = false;
    spinSelect = {x:0, y:0};
    spinSetting = false;
    moving = false;
}
function dist2(a, b) {
    return (a.x-b.x)**2 + (a.y-b.y)**2;
}
function length2(a, b) {
    return Math.sqrt(dist2(a, b));
}
function allBallsStopped() {
    if (Math.abs(cueBall.vx) > 0.08 || Math.abs(cueBall.vy) > 0.08) return false;
    for (let b of balls) {
        if (Math.abs(b.vx) > 0.08 || Math.abs(b.vy) > 0.08) return false;
    }
    return true;
}

// ====== GAME PHYSICS & COLLISION ======
function updateBalls() {
    // Spin effects
    let speed = Math.sqrt(cueBall.vx*cueBall.vx + cueBall.vy*cueBall.vy);
    if (speed > 0.01 && (cueBall.spinX !== 0 || cueBall.spinY !== 0)) {
        let dir = Math.atan2(cueBall.vy, cueBall.vx);
        let perp = dir + Math.PI/2;
        cueBall.vx += Math.cos(perp) * cueBall.spinX * SPIN_EFFECT_SIDE * (speed/7);
        cueBall.vy += Math.sin(perp) * cueBall.spinX * SPIN_EFFECT_SIDE * (speed/7);

        cueBall.vx += Math.cos(dir) * cueBall.spinY * SPIN_EFFECT_VERTICAL * 0.7;
        cueBall.vy += Math.sin(dir) * cueBall.spinY * SPIN_EFFECT_VERTICAL * 0.7;

        cueBall.spinX *= SPIN_DAMPING;
        cueBall.spinY *= SPIN_DAMPING;
    }
    cueBall.x += cueBall.vx;
    cueBall.y += cueBall.vy;
    cueBall.vx *= FRICTION;
    cueBall.vy *= FRICTION;
    wallCollision(cueBall, true);

    for (let b of balls) {
        b.x += b.vx;
        b.y += b.vy;
        b.vx *= FRICTION;
        b.vy *= FRICTION;
        wallCollision(b, false);
    }

    let allBalls = [cueBall, ...balls];
    for (let i = 0; i < allBalls.length; i++) {
        for (let j = i+1; j < allBalls.length; j++) {
            handleBallCollision(allBalls[i], allBalls[j]);
        }
    }
}

function handleBallCollision(a, b) {
    let rA = (a === cueBall) ? CUE_BALL_RADIUS : BALL_RADIUS;
    let rB = (b === cueBall) ? CUE_BALL_RADIUS : BALL_RADIUS;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let dist = Math.sqrt(dx*dx + dy*dy);
    if (dist === 0) return;
    const minDist = rA + rB;
    if (dist < minDist - EPS) {
        let overlap = minDist - dist + EPS;
        let nx = dx / dist, ny = dy / dist;
        a.x -= nx * overlap / 2;
        a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2;
        b.y += ny * overlap / 2;

        let dvx = b.vx - a.vx;
        let dvy = b.vy - a.vy;
        let vrel = dvx * nx + dvy * ny;

        if (vrel < 0) {
            const restitution = 0.98;
            let impulse = -restitution * vrel;
            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;

            // Transfer side spin/topspin if cue ball hits
            if (a === cueBall) {
                let tangentX = -ny, tangentY = nx;
                let spinX = a.spinX * 1.0;
                b.vx += tangentX * spinX;
                b.vy += tangentY * spinX;
                a.spinX *= 0.4;

                let topspin = a.spinY * 0.6;
                b.vx += nx * topspin;
                b.vy += ny * topspin;
                a.spinY *= 0.4;
            }
        }
    }
}

function wallCollision(ball, isCueBall = false) {
    let r = isCueBall && showSpinUI ? SPIN_UI_RADIUS : (isCueBall ? CUE_BALL_RADIUS : BALL_RADIUS);
    if (ball.x - r < WALL) {
        ball.x = WALL + r;
        ball.vx = -ball.vx * 0.9;
        if (isCueBall) {
            cueBall.spinX *= -0.6;
            cueBall.spinY *= 0.95;
        }
    }
    if (ball.x + r > TABLE_W - WALL) {
        ball.x = TABLE_W - WALL - r;
        ball.vx = -ball.vx * 0.9;
        if (isCueBall) {
            cueBall.spinX *= -0.6;
            cueBall.spinY *= 0.95;
        }
    }
    if (ball.y - r < WALL) {
        ball.y = WALL + r;
        ball.vy = -ball.vy * 0.9;
        if (isCueBall) {
            cueBall.spinX *= 0.95;
            cueBall.spinY *= -0.6;
        }
    }
    if (ball.y + r > TABLE_H - WALL) {
        ball.y = TABLE_H - WALL - r;
        ball.vy = -ball.vy * 0.9;
        if (isCueBall) {
            cueBall.spinX *= 0.95;
            cueBall.spinY *= -0.6;
        }
    }
}

function checkPockets() {
    for (let p of pockets) {
        if (length2(cueBall, p) < POCKET_RADIUS) {
            cueBall.x = 150;
            cueBall.y = TABLE_H/2;
            cueBall.vx = 0; cueBall.vy = 0;
            cueBall.spinX = 0; cueBall.spinY = 0;
            break;
        }
    }
    let removed = [];
    balls = balls.filter(b => {
        for (let p of pockets) {
            if (length2(b, p) < POCKET_RADIUS) {
                scores[currentPlayer] += b.number;
                removed.push(b);
                return false;
            }
        }
        return true;
    });
    if (removed.length > 0) updateScores();
}

// ====== DRAWING ======
// (drawTable, drawBalls, drawAimbot, drawCue, draw functions unchanged - see previous for full code)

function drawTable() {
    for (let p of pockets) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI*2);
        ctx.fillStyle = "#232323";
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 16;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}
function drawBalls() {
    for (let b of balls) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_RADIUS, 0, Math.PI*2);
        ctx.fillStyle = b.color;
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(b.number, b.x, b.y);
        ctx.restore();
    }
    // Cue ball
    ctx.save();
    let r = showSpinUI ? SPIN_UI_RADIUS : CUE_BALL_RADIUS;
    ctx.beginPath();
    ctx.arc(cueBall.x, cueBall.y, r, 0, Math.PI*2);
    ctx.fillStyle = cueBall.color;
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    if (showSpinUI) {
        ctx.save();
        ctx.globalAlpha = 0.93;
        ctx.beginPath();
        ctx.arc(cueBall.x, cueBall.y, SPIN_UI_RADIUS, 0, Math.PI*2);
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#888";
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cueBall.x, cueBall.y, SPIN_UI_RADIUS-7, 0, Math.PI*2);
        ctx.strokeStyle = "#ccc";
        ctx.lineWidth = 1;
        ctx.setLineDash([2,2]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(cueBall.x-SPIN_UI_RADIUS+7, cueBall.y);
        ctx.lineTo(cueBall.x+SPIN_UI_RADIUS-7, cueBall.y);
        ctx.moveTo(cueBall.x, cueBall.y-SPIN_UI_RADIUS+7);
        ctx.lineTo(cueBall.x, cueBall.y+SPIN_UI_RADIUS-7);
        ctx.strokeStyle = "#bbb";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Selection marker
        let sx = cueBall.x + (SPIN_UI_RADIUS-7) * spinSelect.x;
        let sy = cueBall.y + (SPIN_UI_RADIUS-7) * spinSelect.y;
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI*2);
        ctx.fillStyle = "#d33";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    } else if (Math.abs(cueBall.spinX) > 0.03 || Math.abs(cueBall.spinY) > 0.03) {
        ctx.save();
        let sx = cueBall.x + (CUE_BALL_RADIUS-4) * cueBall.spinX * 0.5 / MAX_SPIN;
        let sy = cueBall.y + (CUE_BALL_RADIUS-4) * cueBall.spinY * 0.5 / MAX_SPIN;
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI*2);
        ctx.fillStyle = "#d22";
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();
}
function drawAimbot() {
    if (!isAiming || moving || !canShoot || showSpinUI) return;
    let dx = aimEnd.x - cueBall.x;
    let dy = aimEnd.y - cueBall.y;
    let mag = Math.sqrt(dx*dx + dy*dy);
    if (mag < 8) return;

    let shotUx = dx / mag;
    let shotUy = dy / mag;

    let swerve = spinApplied.x * SPIN_EFFECT_SIDE * 5.2 * Math.min(mag,120)/120;
    let swerveX = -shotUy * swerve;
    let swerveY = shotUx * swerve;

    let minT = Infinity, hitBall = null, hitPoint = null;
    for (let b of balls) {
        let fakeUx = shotUx + swerveX*0.25;
        let fakeUy = shotUy + swerveY*0.25;
        let norm = Math.sqrt(fakeUx*fakeUx + fakeUy*fakeUy);
        fakeUx /= norm; fakeUy /= norm;
        let relX = b.x - cueBall.x, relY = b.y - cueBall.y;
        let proj = relX*fakeUx + relY*fakeUy;
        if (proj <= 0) continue;
        let closestX = cueBall.x + fakeUx*proj;
        let closestY = cueBall.y + fakeUy*proj;
        let distToBall = Math.hypot(b.x - closestX, b.y - closestY);
        if (distToBall > CUE_BALL_RADIUS+BALL_RADIUS) continue;
        let offset = Math.sqrt((CUE_BALL_RADIUS+BALL_RADIUS)**2 - distToBall*distToBall);
        let t = proj - offset;
        if (t > 0 && t < minT) {
            minT = t;
            hitBall = b;
            hitPoint = {
                x: cueBall.x + fakeUx * t,
                y: cueBall.y + fakeUy * t
            };
        }
    }

    ctx.save();
    ctx.strokeStyle = "#fffa";
    ctx.setLineDash([8,8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cueBall.x, cueBall.y);
    if (hitPoint) {
        ctx.lineTo(hitPoint.x, hitPoint.y);
    } else {
        let maxt = 1000;
        let x = cueBall.x, y = cueBall.y;
        let step = 5;
        while (maxt-- > 0) {
            x += (shotUx + swerveX*0.25) * step;
            y += (shotUy + swerveY*0.25) * step;
            if (x < WALL || x > TABLE_W-WALL || y < WALL || y > TABLE_H-WALL) break;
        }
        ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    if (hitBall && hitPoint) {
        let nx = (hitBall.x - hitPoint.x) / (CUE_BALL_RADIUS+BALL_RADIUS);
        let ny = (hitBall.y - hitPoint.y) / (CUE_BALL_RADIUS+BALL_RADIUS);
        let normalLen = Math.sqrt(nx*nx + ny*ny);
        nx /= normalLen; ny /= normalLen;

        let power = Math.min(mag, 120) * 0.22;
        let vx = (shotUx + swerveX*0.25) * power, vy = (shotUy + swerveY*0.25) * power;
        let vdotn = vx*nx + vy*ny;
        let vdotT = vx*-ny + vy*nx;

        let hit_vx = nx * vdotn;
        let hit_vy = ny * vdotn;
        let cue_vx = -ny * vdotT;
        let cue_vy = nx * vdotT;

        let perp = Math.atan2(cue_vy, cue_vx) + Math.PI/2;
        cue_vx += Math.cos(perp) * spinApplied.x * SPIN_EFFECT_SIDE * 37;
        cue_vy += Math.sin(perp) * spinApplied.x * SPIN_EFFECT_SIDE * 37;
        cue_vx += nx * spinApplied.y * SPIN_EFFECT_VERTICAL * 17;
        cue_vy += ny * spinApplied.y * SPIN_EFFECT_VERTICAL * 17;

        ctx.save();
        ctx.strokeStyle = "#44f";
        ctx.setLineDash([4, 8]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hitBall.x, hitBall.y);
        ctx.lineTo(hitBall.x + hit_vx*28, hitBall.y + hit_vy*28);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = "#f44";
        ctx.setLineDash([6, 10]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hitPoint.x, hitPoint.y);
        ctx.lineTo(hitPoint.x + cue_vx*28, hitPoint.y + cue_vy*28);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }
}
function drawCue() {
    if (!isAiming || moving || !canShoot || showSpinUI) return;
    let dx = aimEnd.x - cueBall.x;
    let dy = aimEnd.y - cueBall.y;
    let mag = Math.sqrt(dx*dx + dy*dy);
    let unitX = dx / (mag || 1);
    let unitY = dy / (mag || 1);

    ctx.save();
    ctx.strokeStyle = "#dcb";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(cueBall.x - unitX * (CUE_BALL_RADIUS+8), cueBall.y - unitY * (CUE_BALL_RADIUS+8));
    ctx.lineTo(cueBall.x - unitX * (CUE_BALL_RADIUS+80 + Math.min(mag, 120)), cueBall.y - unitY * (CUE_BALL_RADIUS+80 + Math.min(mag, 120)));
    ctx.stroke();

    ctx.strokeStyle = "#f33";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cueBall.x, cueBall.y);
    ctx.lineTo(cueBall.x - unitX * Math.min(mag, 120), cueBall.y - unitY * Math.min(mag, 120));
    ctx.stroke();
    ctx.restore();
}
function draw() {
    ctx.clearRect(0, 0, TABLE_W, TABLE_H);
    drawTable();
    drawBalls();
    drawAimbot();
    drawCue();
}

// ====== UI & SCOREBOARD ======
function updateScores() {
    scoreP1.textContent = `Player 1: ${scores[0]}`;
    scoreP2.textContent = `Player 2: ${scores[1]}`;
}
function updateTurn() {
    turnSpan.textContent = `Player ${currentPlayer+1}'s Turn`;
}
function declareWinner() {
    let msg = '';
    if (scores[0] > scores[1]) msg = "Player 1 Wins!";
    else if (scores[1] > scores[0]) msg = "Player 2 Wins!";
    else msg = "It's a Draw!";
    winnerDiv.style.display = 'block';
    winnerDiv.textContent = msg + " Restarting in 3s...";
    setTimeout(() => {
        winnerDiv.style.display = 'none';
        restartGame();
    }, 3000);
}
function restartGame() {
    scores = [0,0];
    currentPlayer = 0;
    canShoot = true;
    moving = false;
    resetBalls();
    updateScores();
    updateTurn();
    draw();
}

// ====== MULTIPLAYER STATE SYNC ======
function serializeGameState() {
    return JSON.stringify({
        balls, cueBall, scores, currentPlayer, spinApplied,
    });
}
function deserializeGameState(state) {
    let s = JSON.parse(state);
    balls = s.balls;
    cueBall = s.cueBall;
    scores = s.scores;
    currentPlayer = s.currentPlayer;
    spinApplied = s.spinApplied;
}

socket.on('waiting', () => {
    statusDiv.textContent = "Waiting for another player...";
    myTurn = false;
});
socket.on('start', (data) => {
    roomId = data.roomId;
    playerNum = Math.random() < 0.5 ? 1 : 2;
    myTurn = (playerNum === 1);
    statusDiv.textContent = myTurn ? "Your turn!" : "Opponent's turn!";
    if (myTurn) {
        resetBalls();
        socket.emit('syncState', { roomId, state: serializeGameState() });
    }
});
socket.on('syncState', (state) => {
    deserializeGameState(state);
    draw();
});
socket.on('opponentShot', (shotData) => {
    cueBall.vx = shotData.cueVX;
    cueBall.vy = shotData.cueVY;
    cueBall.spinX = shotData.spinX;
    cueBall.spinY = shotData.spinY;
    moving = true;
    awaitingOpponentShot = true;
    myTurn = false;
    statusDiv.textContent = "Opponent's turn!";
});

function sendShotToOpponent() {
    socket.emit('playerShot', {
        roomId,
        shotData: {
            cueVX: cueBall.vx,
            cueVY: cueBall.vy,
            spinX: cueBall.spinX,
            spinY: cueBall.spinY,
        }
    });
    socket.emit('syncState', { roomId, state: serializeGameState() });
    myTurn = false;
    statusDiv.textContent = "Opponent's turn!";
}

// ====== EVENT HANDLERS ======
let shiftDown = false;
document.addEventListener("keydown", (e) => {
    if (e.key === "Shift" && !shiftDown) {
        shiftDown = true;
    }
});
document.addEventListener("keyup", (e) => {
    if (e.key === "Shift") {
        shiftDown = false;
        if (showSpinUI) {
            showSpinUI = false;
            spinSetting = false;
        }
    }
});
canvas.addEventListener('mousedown', (e) => {
    let rect = canvas.getBoundingClientRect();
    let mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (shiftDown && !moving && canShoot && myTurn && length2({x: mx, y: my}, cueBall) <= CUE_BALL_RADIUS+8) {
        showSpinUI = true;
        spinSetting = true;
        e.preventDefault();
        return;
    }
    if (!canShoot || moving || showSpinUI || !myTurn) return;
    if (length2({x: mx, y: my}, cueBall) <= CUE_BALL_RADIUS+8) {
        isAiming = true;
        aimStart = {x: cueBall.x, y: cueBall.y};
        aimEnd = {x: mx, y: my};
    }
});
canvas.addEventListener('mousemove', (e) => {
    let rect = canvas.getBoundingClientRect();
    let mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (showSpinUI && spinSetting) {
        let dx = mx - cueBall.x, dy = my - cueBall.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        let maxLen = SPIN_UI_RADIUS-7;
        let len = Math.min(dist, maxLen);
        if (len > 0.1) {
            spinSelect.x = dx / maxLen;
            spinSelect.y = dy / maxLen;
            spinSelect.x = Math.max(-1, Math.min(1, spinSelect.x));
            spinSelect.y = Math.max(-1, Math.min(1, spinSelect.y));
        }
        spinApplied = {...spinSelect};
        return;
    }
    if (!isAiming) return;
    aimEnd = {x: mx, y: my};
});
canvas.addEventListener('mouseup', (e) => {
    if (showSpinUI && spinSetting) {
        spinSetting = false;
        return;
    }
    if (showSpinUI) return;
    if (!isAiming) return;
    isAiming = false;
    if (!myTurn) return;
    let dx = aimEnd.x - cueBall.x;
    let dy = aimEnd.y - cueBall.y;
    let mag = Math.sqrt(dx*dx + dy*dy);
    if (mag < 10) return;
    let power = Math.min(mag, 120) * 0.22;
    let angle = Math.atan2(dy, dx);
    cueBall.vx = Math.cos(angle) * power;
    cueBall.vy = Math.sin(angle) * power;
    cueBall.spinX = spinApplied.x * MAX_SPIN;
    cueBall.spinY = spinApplied.y * MAX_SPIN;
    canShoot = false;
    moving = true;
});
canvas.addEventListener('mouseleave', () => {
    spinSetting = false;
});

// ====== TURN MANAGEMENT ======
function switchPlayer(isOpponent = false) {
    currentPlayer = 1-currentPlayer;
    updateTurn();
    canShoot = true;
    spinApplied = {x:0, y:0};
    if (!isOpponent && myTurn) {
        // My shot just finished, send to opponent, it's now their turn
        sendShotToOpponent();
    } else if (isOpponent) {
        // Opponent's shot just finished, now it's my turn
        myTurn = true;
        awaitingOpponentShot = false;
        statusDiv.textContent = "Your turn!";
    }
}

// ====== MAIN GAME LOOP ======
function gameLoop() {
    if (moving) {
        updateBalls();
        checkPockets();
        if (balls.length === 0) {
            moving = false;
            declareWinner();
            return;
        }
        if (allBallsStopped()) {
            moving = false;
            // If we are animating the opponent's shot, only switch when awaitingOpponentShot is true
            if (awaitingOpponentShot) {
                switchPlayer(true);
            } else if (myTurn === true && !awaitingOpponentShot) {
                switchPlayer(false);
            }
        }
    }
    draw();
    requestAnimationFrame(gameLoop);
}
function init() {
    scores = [0,0];
    currentPlayer = 0;
    canShoot = true;
    moving = false;
    resetBalls();
    updateScores();
    updateTurn();
    draw();
    winnerDiv.style.display = 'none';
}
init();
gameLoop();