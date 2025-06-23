const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const users = [];
const chats = {};
const sockets = {};

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  users.push({ username, password });
  fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
  res.json({ success: true });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const token = generateToken();
  sockets[token] = username;
  res.json({ token, username });
});

app.post('/chat/send', (req, res) => {
  const token = req.headers.authorization;
  const username = sockets[token];
  if (!username) return res.status(401).json({ error: 'Unauthorized' });
  const { to, text } = req.body;
  const key = [username, to].sort().join('|');
  if (!chats[key]) chats[key] = [];
  chats[key].push({ from: username, to, text, time: Date.now() });
  fs.writeFileSync('chats.json', JSON.stringify(chats, null, 2));
  res.json({ success: true });
});

app.post('/chat/delete', (req, res) => {
  const token = req.headers.authorization;
  const username = sockets[token];
  if (!username) return res.status(401).json({ error: 'Unauthorized' });
  const { to, index } = req.body;
  const key = [username, to].sort().join('|');
  if (!chats[key] || typeof index !== 'number' || index < 0 || index >= chats[key].length) {
    return res.status(400).json({ error: 'Invalid index' });
  }
  if (chats[key][index].from !== username) {
    return res.status(403).json({ error: 'Faqat o‘z xabaringizni o‘chira olasiz' });
  }
  chats[key].splice(index, 1);
  fs.writeFileSync('chats.json', JSON.stringify(chats, null, 2));
  res.json({ success: true });
});

app.post('/user/delete', (req, res) => {
  const token = req.headers.authorization;
  const username = sockets[token];
  if (!username) return res.status(401).json({ error: 'Unauthorized' });

  users = users.filter(u => u.username !== username);
  fs.writeFileSync('users.json', JSON.stringify(users, null, 2));

  Object.keys(chats).forEach(key => {
    if (key.includes(username)) delete chats[key];
  });
  fs.writeFileSync('chats.json', JSON.stringify(chats, null, 2));

  delete sockets[token];
  res.json({ success: true });
});

app.post('/logout', (req, res) => {
  const token = req.headers.authorization;
  if (token && sockets[token]) {
    delete sockets[token];
    return res.json({ success: true, message: "Logout bo‘ldingiz" });
  }
  res.status(401).json({ success: false, error: "Avtorizatsiya xatosi" });
});

function generateToken() {
  return Math.random().toString(36).substr(2, 16);
}

function sendPushNotification(title, body) {
  const payload = JSON.stringify({ title, body });
  Object.keys(sockets).forEach(token => {
    const username = sockets[token];
    const socket = sockets[username];
    if (socket) {
      socket.send(payload);
    }
  });
}

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
wss.on('connection', function(ws) {
  ws.on('message', function(message) {
    try {
      const data = JSON.parse(message);
      if (data.type === 'auth' && data.token && sockets[data.token]) {
        ws.username = sockets[data.token];
        sockets[ws.username] = ws;
      }
    } catch (e) {}
  });
  ws.on('close', function() {
    if (ws.username) delete sockets[ws.username];
  });
});

server.listen(4001, () => {
  console.log('Server ishlayapti');
});