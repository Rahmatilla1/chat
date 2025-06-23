const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const cors = require('cors');
const webpush = require('web-push');
const PORT = process.env.PORT || 4001;

const publicVapidKey = 'BE2xPCwCk9wNYrH8Z0SXxzp4ZbkTTi1YqTpdhYyp67hjgiql0Fpr0zieO4kujvtrAi4z0ZARTRgh0mx7_g21Qww';
const privateVapidKey = 'utwzQSnnIS_xi_u2IP4xbuamgLSNYwKkJbTF_0zfh7w';
webpush.setVapidDetails(
  'mailto:youremail@example.com',
  publicVapidKey,
  privateVapidKey
);
const app = express();
app.use(express.json());
app.use(cors());

const USERS_FILE = 'users.json';
const CHATS_FILE = 'chats.json';
const sessions = {};
let users = [];
let chats = {};
const sockets = {}; // WebSocket ulanishlari uchun

// Fayllardan ma'lumotlarni yuklash
if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
if (fs.existsSync(CHATS_FILE)) chats = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf-8'));

let subscriptions = [];

app.post('/subscribe', (req, res) => {
  const subscription = req.body;
  // Subscriptionni ma'lumotlar bazasiga saqlash
  db.saveSubscription(subscription);
  res.status(201).json({});
});

function sendPushNotification(title, body) {
    const payload = JSON.stringify({ title, body });
    subscriptions.forEach(sub => {
        webpush.sendNotification(sub, payload).catch(() => {});
    });
}

// Ro'yxatdan o'tish
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already exists' });
    }
    users.push({ username, password });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    res.json({ success: true });
});

// Login
function generateToken() {
    return Math.random().toString(36).substr(2, 16);
}
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const token = generateToken();
    sessions[token] = username;
    res.json({ token, username });
});

// Foydalanuvchilar ro'yxati
app.get('/users', (req, res) => {
    res.json(users.map(u => ({ username: u.username })));
});

// Chat tarixini olish
app.get('/chat/:withUser', (req, res) => {
    const token = req.headers.authorization;
    const username = sessions[token];
    if (!username) return res.status(401).json({ error: 'Unauthorized' });
    const withUser = req.params.withUser;
    const key = [username, withUser].sort().join('|');
    res.json(chats[key] || []);
});

// WebSocket orqali xabar berish
function notifyUser(username) {
    if (sockets[username]) {
        sockets[username].send(JSON.stringify({ type: 'new_message' }));
    }
}

// Xabar yuborish
// ...existing code...

// Xabar yuborish
app.post('/chat/send', (req, res) => {
    const token = req.headers.authorization;
    const username = sessions[token];
    if (!username) return res.status(401).json({ error: 'Unauthorized' });

    const { to, text } = req.body;
    const key = [username, to].sort().join('|');
    if (!chats[key]) chats[key] = [];
    chats[key].push({ from: username, to, text, time: Date.now() });
    fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));

    // WebSocket orqali xabar berish
    notifyUser(to);
    notifyUser(username);

    // Push notification yuborish
    sendPushNotification("Yangi xabar!", "Sizga yangi xabar keldi.");

    res.json({ success: true });
});

// Xabar o'chirish
app.post('/chat/delete', (req, res) => {
    const token = req.headers.authorization;
    const username = sessions[token];
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
    fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));
    res.json({ success: true });
});

// Foydalanuvchini o'chirish
app.post('/user/delete', (req, res) => {
    const token = req.headers.authorization;
    const username = sessions[token];
    if (!username) return res.status(401).json({ error: 'Unauthorized' });

    users = users.filter(u => u.username !== username);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

    Object.keys(chats).forEach(key => {
        if (key.includes(username)) delete chats[key];
    });
    fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));

    delete sessions[token];
    res.json({ success: true });
});

// Logout
app.post('/logout', (req, res) => {
    const token = req.headers.authorization;
    if (token && sessions[token]) {
        delete sessions[token];
        return res.json({ success: true, message: "Logout bo‘ldingiz" });
    }
    res.status(401).json({ success: false, error: "Avtorizatsiya xatosi" });
});

// WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
wss.on('connection', function(ws) {
    ws.on('message', function(message) {
        try {
            const data = JSON.parse(message);
            if (data.type === 'auth' && data.token && sessions[data.token]) {
                ws.username = sessions[data.token];
                sockets[ws.username] = ws;
            }
        } catch (e) {}
    });
    ws.on('close', function() {
        if (ws.username) delete sockets[ws.username];
    });
});

server.listen(PORT, () => {
    console.log(`Server ${PORT}-portda ishlayapti`);
});