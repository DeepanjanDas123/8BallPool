const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let waitingPlayer = null;

io.on('connection', (socket) => {
    if (waitingPlayer) {
        const roomId = `room-${socket.id}-${waitingPlayer.id}`;
        socket.join(roomId);
        waitingPlayer.join(roomId);
        io.to(roomId).emit('start', { roomId });
        waitingPlayer = null;
    } else {
        waitingPlayer = socket;
        socket.emit('waiting');
    }

    socket.on('playerShot', ({ roomId, shotData }) => {
        socket.to(roomId).emit('opponentShot', shotData);
    });

    socket.on('syncState', ({ roomId, state }) => {
        socket.to(roomId).emit('syncState', state);
    });

    socket.on('disconnect', () => {
        if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;
    });
});

app.use(express.static('public'));

server.listen(3000, () => console.log('Listening on http://localhost:3000'));