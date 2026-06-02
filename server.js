const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const mineflayer = require("mineflayer");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const USERNAME = "admin";
const PASSWORD = "root";

let runningBots = {};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
session({
secret: "afk-panel-secret",
resave: false,
saveUninitialized: false
})
);

app.use(express.static("public"));

function loadBots() {
if (!fs.existsSync("./bots.json")) {
fs.writeFileSync("./bots.json", "[]");
}
return JSON.parse(fs.readFileSync("./bots.json"));
}

function saveBots(data) {
fs.writeFileSync("./bots.json", JSON.stringify(data, null, 2));
}

app.post("/login", (req, res) => {
const { username, password } = req.body;

if (username === USERNAME && password === PASSWORD) {
req.session.loggedIn = true;
return res.json({ success: true });
}

res.status(401).json({ success: false });
});

app.get("/bots", (req, res) => {
if (!req.session.loggedIn)
return res.status(403).json({ error: "Unauthorized" });

res.json(loadBots());
});

app.post("/add-bot", (req, res) => {
if (!req.session.loggedIn)
return res.status(403).json({ error: "Unauthorized" });

const bots = loadBots();

bots.push({
id: Date.now(),
username: req.body.username,
host: req.body.host,
port: Number(req.body.port || 25565)
});

saveBots(bots);

res.json({ success: true });
});

app.post("/start-bot/:id", (req, res) => {
if (!req.session.loggedIn)
return res.status(403).json({ error: "Unauthorized" });

const bots = loadBots();
const botData = bots.find(
b => String(b.id) === String(req.params.id)
);

if (!botData)
return res.status(404).json({ error: "Bot not found" });

if (runningBots[botData.id])
return res.json({ success: false });

const bot = mineflayer.createBot({
host: botData.host,
port: botData.port,
username: botData.username
});

runningBots[botData.id] = bot;

bot.once("spawn", () => {
io.emit("console", "[${botData.username}] Joined server");

setInterval(() => {
  if (!bot.entity) return;

  bot.setControlState("jump", true);

  setTimeout(() => {
    bot.setControlState("jump", false);
  }, 500);
}, 30000);

});

bot.on("chat", (username, message) => {
io.emit(
"console",
"[CHAT] ${username}: ${message}"
);
});

bot.on("kicked", reason => {
io.emit(
"console",
"[${botData.username}] Kicked: ${reason}"
);
});

bot.on("error", err => {
io.emit(
"console",
"[${botData.username}] ${err.message}"
);
});

res.json({ success: true });
});

app.post("/stop-bot/:id", (req, res) => {
const bot = runningBots[req.params.id];

if (!bot)
return res.json({ success: false });

bot.quit();

delete runningBots[req.params.id];

res.json({ success: true });
});

app.post("/chat/:id", (req, res) => {
const bot = runningBots[req.params.id];

if (!bot)
return res.status(404).json({ error: "Bot offline" });

bot.chat(req.body.message);

res.json({ success: true });
});

io.on("connection", socket => {
console.log("Dashboard connected");
});

server.listen(PORT, () => {
console.log("Panel running on ${PORT}");
});
