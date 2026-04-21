require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();


const CLIENT_ID = "1494758914233860127";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const db = new sqlite3.Database("./data.db");

db.run(`
CREATE TABLE IF NOT EXISTS users (
id TEXT PRIMARY KEY,
money INTEGER DEFAULT 1000,
maister INTEGER DEFAULT 0,
daily INTEGER DEFAULT 0,
hour INTEGER DEFAULT 0,
block INTEGER DEFAULT 0
)`);

function getUser(id, cb) {
  db.get("SELECT * FROM users WHERE id = ?", [id], (err, row) => {
    if (!row) {
      const newUser = { id, money: 1000, daily: 0, hour: 0, block: 0 };
      db.run("INSERT INTO users (id, money) VALUES (?, ?)", [id, 1000], () => {
        cb(newUser);
      });
    } else cb(row);
  });
}

function setMoney(id, money) {
  db.run("UPDATE users SET money = ? WHERE id = ?", [money, id], err => {
    if (err) console.error("setMoney error:", err);
  });
}

function setField(id, field, value) {
  db.run(`UPDATE users SET ${field} = ? WHERE id = ?`, [value, id], err => {
    if (err) console.error("setField error:", err);
  });
}

function parseTime(t) {
  const num = parseInt(t);
  if (t.endsWith("s")) return num * 1000;
  if (t.endsWith("m")) return num * 60000;
  if (t.endsWith("h")) return num * 3600000;
  return null;
}

function jackpotWin() {
  return Math.floor(Math.random() * 200) === 1;
}

const slotCooldown = {};
const bjCooldown = {};
const rouletteCooldown = {};
const bj = {};

const card = () => Math.floor(Math.random() * 11) + 1;

client.on("ready", () => {
  console.log("Bot działa ✔");
});

// =====================
// ZAŁADUJ DODATKOWE KOMENDY Z FOLDERU bot/
// =====================
//require("./bot/index1")(client, db, getUser, setMoney, setField);

// =====================
// GŁÓWNE KOMENDY
// =====================
client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith("!")) return;

  const args = message.content.split(" ");
  const cmd = args[0].toLowerCase();

  const hasMaister = () => message.member.roles.cache.some(r => r.name === "Maister");
  const isOwner = () => message.guild && message.author.id === message.guild.ownerId;

  function checkBlock(cb) {
    getUser(message.author.id, u => {
      if (Date.now() < u.block) {
        message.reply("❌ masz blokadę gry");
        return;
      }
      cb(u);
    });
  }

  if (cmd === "!spis") {
    try {
      await message.author.send(`
📜 KOMENDY GRACZA
🏆 !top - ranking graczy
💰 !kasa - stan konta

🎁 !daily - nagroda co 24h (2500-10000$)
⏱ !hour - nagroda co 1h (500-2500$)

🎰 !sloty <kwota> - automaty
🎡 !ruletka <kwota> - ruletka
🃏 !blackjack <kwota> - blackjack

💡 każda gra ma szansę na JACKPOT x20
⏳ cooldown: 5s
      `);
      message.reply("📩 sprawdź DM");
    } catch {
      message.reply("❌ masz wyłączone DM");
    }
    return;
  }

  if (cmd === "!kasa") {
    getUser(message.author.id, u => {
      message.reply(`💰 Masz: ${u.money}$`);
    });
    return;
  }

  if (cmd === "!daily") {
    getUser(message.author.id, u => {
      const now = Date.now();
      if (now - u.daily < 86400000) {
        message.reply("❌ 24h cooldown");
        return;
      }
      const reward = Math.floor(Math.random() * 7500) + 2500;
      setMoney(message.author.id, u.money + reward);
      setField(message.author.id, "daily", now);
      message.reply(`🎁 +${reward}$`);
    });
    return;
  }

  if (cmd === "!hour") {
    getUser(message.author.id, u => {
      const now = Date.now();
      if (now - u.hour < 3600000) {
        message.reply("❌ 1h cooldown");
        return;
      }
      const reward = Math.floor(Math.random() * 2000) + 500;
      setMoney(message.author.id, u.money + reward);
      setField(message.author.id, "hour", now);
      message.reply(`⏱ +${reward}$`);
    });
    return;
  }

  if (cmd === "!view") {
    if (!hasMaister()) { message.reply("❌ brak rangi"); return; }
    const target = message.mentions.users.first();
    if (!target) return;
    getUser(target.id, u => {
      message.reply(`👁 ${target} ma ${u.money}$`);
    });
    return;
  }

  if (cmd === "!top") {
    db.all("SELECT * FROM users ORDER BY money DESC LIMIT 10", [], (err, rows) => {
      if (err) { message.reply("❌ błąd bazy danych"); return; }
      if (!rows || rows.length === 0) { message.reply("❌ brak danych"); return; }
      let text = "🏆 TOP 10 NAJBOGATSZYCH\n\n";
      rows.forEach((u, i) => { text += `${i + 1}. <@${u.id}> - ${u.money}$\n`; });
      message.reply(text);
    });
    return;
  }

  if (cmd === "!sloty") {
    const bet = parseInt(args[1]);
    if (!bet || isNaN(bet) || bet <= 0) { message.reply("❌ podaj kwotę"); return; }

    const now = Date.now();
    if (slotCooldown[message.author.id] && now - slotCooldown[message.author.id] < 5000) {
      message.reply("⏳ cooldown 5s");
      return;
    }

    checkBlock(u => {
      if (u.money < bet) { message.reply("❌ brak kasy"); return; }

      slotCooldown[message.author.id] = now;
      setMoney(message.author.id, u.money - bet);

      const symbols = ["🍒", "🍋", "🍇", "🔔", "💎", "7️⃣", "⭐"];
      const spin = () => symbols[Math.floor(Math.random() * symbols.length)];

      const r1 = spin();
      const r2 = spin();
      const r3 = spin();

      let frame = 0;
      message.reply({ content: `🎰 ${spin()} | ${spin()} | ${spin()}` }).then(msg => {
        const interval = setInterval(() => {
          frame++;
          if (frame < 3) {
            msg.edit(`🎰 ${spin()} | ${spin()} | ${spin()}`);
          } else {
            clearInterval(interval);
            let resultMsg = "";
            if (r1 === r2 && r2 === r3) {
              const gain = bet * 15;
              setMoney(message.author.id, u.money - bet + gain);
              resultMsg = `🎰 ${r1} | ${r2} | ${r3}\n🎉 3 takie same! +${gain - bet}$ (x15)`;
            } else if (r1 === r2 || r2 === r3 || r1 === r3) {
              const back = Math.floor(bet * 4);
              setMoney(message.author.id, u.money - bet + back);
              resultMsg = `🎰 ${r1} | ${r2} | ${r3}\n😐 2 takie same, 300% → -${bet - back}$`;
            } else {
              resultMsg = `🎰 ${r1} | ${r2} | ${r3}\n❌ brak wygranej -${bet}$`;
            }
            msg.edit(resultMsg);
          }
        }, 1000);
      });
    });
    return;
  }

  if (cmd === "!ruletka") {
    const bet = parseInt(args[1]);
    if (!bet || isNaN(bet) || bet <= 0) { message.reply("❌ podaj kwotę"); return; }
    const now = Date.now();
    if (rouletteCooldown[message.author.id] && now - rouletteCooldown[message.author.id] < 5000) {
      message.reply("⏳ cooldown 5s");
      return;
    }
    checkBlock(u => {
      if (u.money < bet) { message.reply("❌ brak kasy"); return; }
      rouletteCooldown[message.author.id] = now;
      setMoney(message.author.id, u.money - bet);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`red_${bet}`).setLabel("🔴").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`black_${bet}`).setLabel("⚫").setStyle(ButtonStyle.Secondary)
      );
      message.reply({ content: `🎡 grasz za ${bet}$`, components: [row] });
    });
    return;
  }

  if (cmd === "!blackjack") {
    const bet = parseInt(args[1]);
    if (!bet || isNaN(bet) || bet <= 0) { message.reply("❌ podaj kwotę"); return; }
    const now = Date.now();
    if (bjCooldown[message.author.id] && now - bjCooldown[message.author.id] < 5000) {
      message.reply("⏳ cooldown 5s");
      return;
    }
    checkBlock(u => {
      if (u.money < bet) { message.reply("❌ brak kasy"); return; }
      bjCooldown[message.author.id] = now;
      setMoney(message.author.id, u.money - bet);
      bj[message.author.id] = { player: card() + card(), dealer: card() + card(), bet };
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("hit").setLabel("Hit").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("stand").setLabel("Stand").setStyle(ButtonStyle.Danger)
      );
      message.reply({ content: `🃏 TY: ${bj[message.author.id].player} | DEALER: ?`, components: [row] });
    });
    return;
  }

  if (cmd === "!maister_add") {
    if (!isOwner()) { message.reply("❌ tylko właściciel"); return; }
    const target = message.mentions.members.first();
    if (!target) return;
    const role = message.guild.roles.cache.find(r => r.name === "Maister");
    if (!role) { message.reply("❌ brak roli"); return; }
    target.roles.add(role);
    message.reply("👑 nadano Maister");
    return;
  }

  if (cmd === "!add") {
    if (!hasMaister()) { message.reply("❌ brak rangi"); return; }
    const target = message.mentions.users.first();
    const amount = parseInt(args[2]);
    if (!target || isNaN(amount) || amount <= 0) { message.reply("❌ podaj poprawną kwotę"); return; }
    getUser(target.id, u => {
      setMoney(target.id, u.money + amount);
      message.reply(`💰 dodano ${amount}$`);
    });
    return;
  }

  if (cmd === "!del") {
    if (!hasMaister()) { message.reply("❌ brak rangi"); return; }
    const target = message.mentions.users.first();
    const amount = parseInt(args[2]);
    if (!target || isNaN(amount) || amount <= 0) { message.reply("❌ podaj poprawną kwotę"); return; }
    getUser(target.id, u => {
      setMoney(target.id, Math.max(0, u.money - amount));
      message.reply(`💸 zabrano ${amount}$`);
    });
    return;
  }

  if (cmd === "!gryzab") {
    if (!hasMaister()) { message.reply("❌ brak rangi"); return; }
    const target = message.mentions.users.first();
    const time = args[2];
    if (!target || !time) return;
    const ms = parseTime(time);
    if (!ms) { message.reply("❌ użyj np 10s / 5m / 2h"); return; }
    setField(target.id, "block", Date.now() + ms);
    message.reply(`🔒 blokada na ${time}`);
    return;
  }

  if (cmd === "!gryunblock") {
    if (!hasMaister()) { message.reply("❌ brak rangi"); return; }
    const target = message.mentions.users.first();
    if (!target) return;
    setField(target.id, "block", 0);
    message.reply("🔓 odblokowano");
    return;
  }
});

// =====================
// BUTTONY
// =====================
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  await interaction.deferUpdate();

  const id = interaction.user.id;
  const cid = interaction.customId;

  if (cid.startsWith("red_") || cid.startsWith("black_")) {
    const parts = cid.split("_");
    const color = parts[0];
    const bet = parseInt(parts[1]);
    getUser(id, u => {
      const win = Math.random() < 0.5 ? "red" : "black";
      if (color === win) {
        let reward = bet * 2;
        let msg = `🎉 +${bet}$ (${win})`;
        if (jackpotWin()) {
          const jp = bet * 20;
          reward += jp;
          msg = `🎡 JACKPOT! +${bet + jp}$ (${win})`;
        }
        setMoney(id, u.money + reward);
        interaction.editReply({ content: msg, components: [] });
      } else {
        interaction.editReply({ content: `❌ -${bet}$ (${win})`, components: [] });
      }
    });
    return;
  }

  if (cid === "hit") {
    const g = bj[id];
    if (!g) { interaction.editReply({ content: "❌ brak aktywnej gry", components: [] }); return; }
    g.player += card();
    if (g.player > 21) {
      delete bj[id];
      interaction.editReply({ content: `❌ przegrałeś (${g.player})`, components: [] });
      return;
    }
    interaction.editReply({ content: `🃏 TY: ${g.player} | DEALER: ?`, components: interaction.message.components });
    return;
  }

  if (cid === "stand") {
    const g = bj[id];
    if (!g) { interaction.editReply({ content: "❌ brak aktywnej gry", components: [] }); return; }
    while (g.dealer < 17) g.dealer += card();
    getUser(id, u => {
      let msg = "";
      if (g.player > g.dealer || g.dealer > 21) {
        let reward = g.bet * 2;
        msg = `🎉 wygrana | TY: ${g.player} | DEALER: ${g.dealer}`;
        if (jackpotWin()) {
          const jp = g.bet * 20;
          reward += jp;
          msg = `🃏 JACKPOT! wygrana | TY: ${g.player} | DEALER: ${g.dealer}`;
        }
        setMoney(id, u.money + reward);
      } else if (g.player === g.dealer) {
        setMoney(id, u.money + g.bet);
        msg = `🤝 remis | TY: ${g.player} | DEALER: ${g.dealer}`;
      } else {
        msg = `❌ przegrana | TY: ${g.player} | DEALER: ${g.dealer}`;
      }
      delete bj[id];
      interaction.editReply({ content: msg, components: [] });
    });
    return;
  }
});

client.login(process.env.TOKEN);
