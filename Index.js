const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const cors = require('cors');
const webpush = require('web-push');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 4001;

const USERS_FILE = 'users.json';
const CHATS_FILE = 'chats.json';

// Push notification keys
const publicVapidKey = 'BE2xPCwCk9wNYrH8Z0SXxzp4ZbkTTi1YqTpdhYyp67hjgiql0Fpr0zieO4kujvtrAi4z0ZARTRgh0mx7_g21Qww';
const privateVapidKey = 'utwzQSnnIS_xi_u2IP4xbuamgLSNYwKkJbTF_0zfh7w';
webpush.setVapidDetails('mailto:youremail@example.com', publicVapidKey, privateVapidKey);

app.use(cors());
app.use(express.json());

let users = [];
let chats = {};
let sessions = {};
let sockets = {};
let subscriptions = [];

// Utilities
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getTokenUser(token) {
  return sessions[token];
}

function notifyUser(username) {
  if (sockets[username]) {
    sockets[username].send(JSON.stringify({ type: 'new_message' }));
  }
}

function sendPushNotification(title, body) {
  const payload = JSON.stringify({ title, body });
  subscriptions.forEach(sub => {
    webpush.sendNotification(sub, payload).catch(() => {});
  });
}

// Load from files
if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE));
if (fs.existsSync(CHATS_FILE)) chats = JSON.parse(fs.readFileSync(CHATS_FILE));

// Endpoints
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  users.push({ username, password });
  saveJSON(USERS_FILE, users);
  res.json({ success: true });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const token = Math.random().toString(36).substr(2, 16);
  sessions[token] = username;
  res.json({ token, username });
});

app.get('/users', (req, res) => {
  res.json(users.map(u => ({ username: u.username })));
});

app.get('/chat/:withUser', (req, res) => {
  const user = getTokenUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const key = [user, req.params.withUser].sort().join('|');
  res.json(chats[key] || []);
});

app.post('/chat/send', (req, res) => {
  const user = getTokenUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { to, text } = req.body;
  const key = [user, to].sort().join('|');
  if (!chats[key]) chats[key] = [];
  chats[key].push({ from: user, to, text, time: Date.now() });
  saveJSON(CHATS_FILE, chats);
  notifyUser(to);
  notifyUser(user);
  sendPushNotification("Yangi xabar!", `${user} sizga yozdi.`);
  res.json({ success: true });
});

app.post('/chat/delete', (req, res) => {
  const user = getTokenUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { to, index } = req.body;
  const key = [user, to].sort().join('|');
  if (!chats[key] || !Number.isInteger(index) || index < 0 || index >= chats[key].length)
    return res.status(400).json({ error: 'Invalid index' });
  if (chats[key][index].from !== user)
    return res.status(403).json({ error: 'Faqat o‘zingiz yuborgan xabarni o‘chira olasiz' });
  chats[key].splice(index, 1);
  saveJSON(CHATS_FILE, chats);
  res.json({ success: true });
});

app.post('/user/delete', (req, res) => {
  const user = getTokenUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  users = users.filter(u => u.username !== user);
  saveJSON(USERS_FILE, users);
  for (const key in chats) {
    if (key.includes(user)) delete chats[key];
  }
  saveJSON(CHATS_FILE, chats);
  delete sessions[req.headers.authorization];
  res.json({ success: true });
});

app.post('/logout', (req, res) => {
  const token = req.headers.authorization;
  if (sessions[token]) {
    delete sessions[token];
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Avtorizatsiya xatosi' });
});

app.post('/subscribe', (req, res) => {
  const sub = req.body;
  subscriptions.push(sub);
  res.status(201).json({});
});

// WebSocket
wss.on('connection', function(ws) {
  ws.on('message', function(message) {
    try {
      const data = JSON.parse(message);
      if (data.type === 'auth' && data.token && sessions[data.token]) {
        ws.username = sessions[data.token];
        sockets[ws.username] = ws;
      }
    } catch {}
  });
  ws.on('close', function() {
    if (ws.username) delete sockets[ws.username];
  });
});

server.listen(PORT, () => {
  console.log(`Server ${PORT}-portda ishlayapti`);
});