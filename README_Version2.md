# Multiplayer Pool Game

A real-time multiplayer 8-ball pool game built with Node.js, Socket.IO, and HTML5 Canvas. Play with a friend on desktop or mobile—mobile-friendly controls included!

## Features

- **Realtime Multiplayer**: Play with a friend across devices and networks.
- **Touch-Friendly**: Mobile controls for aiming and spin.
- **Spin Control**: Hold the cue ball to add spin (long-press on mobile, Shift+Click on desktop).
- **Responsive Canvas**: Scales to fit your device.
- **Visual Effects**: Aimbot lines, cue stick, and ball spin preview.
- **Simple Multiplayer Rooms**: First two players are paired automatically.

## Getting Started

Follow these steps to clone and run the project locally.

### Prerequisites

- [Node.js](https://nodejs.org/) (version 14 or higher recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)

### Clone the Repository

```bash
git clone https://github.com/yourusername/pool-game.git
cd pool-game
```

### Install Dependencies

```bash
npm install
```

### Start the Server

```bash
node server.js
```

By default, the game server will run on [http://localhost:3000](http://localhost:3000).

### Play the Game

1. Open [http://localhost:3000](http://localhost:3000) in your browser.
2. To play with someone else:
    - Send your IP address and port (e.g. `http://192.168.1.5:3000`) to your friend on the same network.
    - Or, use a service like [ngrok](https://ngrok.com/) to expose your local server to the internet:
      ```bash
      npx ngrok http 3000
      ```
      Share the public `https://xxxx.ngrok.io` link with your friend.
3. Both players should connect; the game will begin when two players are present.

### Mobile Controls

- **Aiming/Shot**: Drag from the cue ball to aim and set power, then release to shoot.
- **Spin Control**: Long-press (hold your finger) on the cue ball to open the spin UI, then drag to set spin. Release to apply.

### Desktop Controls

- **Aiming/Shot**: Drag from the cue ball with your mouse.
- **Spin Control**: Hold `Shift` and click the cue ball to open spin UI, drag to set spin, release to apply.

## Project Structure

```
pool-game/
│
├── server.js          # Node.js/Socket.IO backend
├── package.json
└── public/
    ├── index.html
    ├── script.js      # Main game logic (client)
    └── style.css
```

## Deployment

To make your game accessible on the internet, consider deploying to:

- [Render](https://render.com/)
- [Railway](https://railway.app/)
- [Glitch](https://glitch.com/)
- [Replit](https://replit.com/)
- Or use a VPS (DigitalOcean, AWS, etc.)

## License

MIT License

---

*Made by [Deepanjan Das](https://github.com/DeepanjanDas123). Enjoy the game!*