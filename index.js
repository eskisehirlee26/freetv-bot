require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const db = require('./database');

// Ortam değişkenleri kontrolleri
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID;

if (!BOT_TOKEN || BOT_TOKEN === 'BURAYA_BOT_TOKEN_GELECEK') {
    console.error("HATA: Lütfen .env dosyasına geçerli bir BOT_TOKEN girin.");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(cors());
app.use(express.json());

// Rastgele 6 haneli kod üretici
function generateOTP() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateAppUsername() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 5; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'FREE-' + result;
}

// --- TELEGRAM BOT KISMI ---

bot.start((ctx) => {
    if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        ctx.reply(`✅ Gizli grup başarıyla sisteme bağlandı!\nGrup ID: ${ctx.chat.id}\nLütfen bu ID'yi bana kopyalayıp gönderin, böylece logları bu gruba bağlayabilirim.`);
    } else {
        ctx.reply('FREE TV Sistemine Hoş Geldiniz! Uygulamaya giriş yapmak için /kodal yazabilirsiniz.');
    }
});

bot.command('kodal', (ctx) => {
    if (ctx.chat.type !== 'private') {
        return ctx.reply('⚠️ Lütfen güvenlik için şifrenizi gruptan değil, bana özel mesaj atarak alın.');
    }
    const telegramId = ctx.from.id.toString();
    const username = ctx.from.username || ctx.from.first_name;

    // Kullanıcının önceden kodu var mı kontrol et
    db.get(`SELECT app_username, otp_code FROM users WHERE telegram_id = ?`, [telegramId], (err, row) => {
        if (err) return ctx.reply('Veritabanı hatası oluştu.');
        
        if (row && row.otp_code) {
            return ctx.reply(`⚠️ Daha önce bir hesap oluşturmuşsunuz! Sistem sadece 1 hesaba izin vermektedir.\n\nKullanıcı Adı: ${row.app_username}\nŞifreniz: ${row.otp_code}`);
        }

        // Yeni kod üret ve kaydet
        const newCode = generateOTP();
        const newAppUsername = generateAppUsername();
        db.run(
            `INSERT INTO users (telegram_id, username, app_username, otp_code) VALUES (?, ?, ?, ?)`,
            [telegramId, username, newAppUsername, newCode],
            function(err) {
                if (err) {
                    console.error(err);
                    return ctx.reply('Kod oluşturulurken bir hata oluştu.');
                }
                ctx.reply(`✅ Hesabınız Başarıyla Oluşturuldu!\n\nKullanıcı Adı: ${newAppUsername}\nŞifreniz: ${newCode}\n\nBu bilgileri FREE TV uygulamasına girerek yayınları izlemeye başlayabilirsiniz.`);
                
                // Gizli gruba log at
                if (ADMIN_GROUP_ID) {
                    bot.telegram.sendMessage(ADMIN_GROUP_ID, `🚨 YENİ HESAP AÇILDI\nKişi: @${username} (ID: ${telegramId})\nKullanıcı Adı: ${newAppUsername}\nŞifre: ${newCode}`);
                }
            }
        );
    });
});

bot.command('admin', (ctx) => {
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
        return ctx.reply('Bu komut sadece gizli yönetici grubunda kullanılabilir.');
    }
    ctx.reply('Admin Paneline Hoş Geldiniz. Ne yapmak istersiniz?', Markup.inlineKeyboard([
        [Markup.button.callback('Kullanıcı Banla', 'action_ban'), Markup.button.callback('Ban Kaldır', 'action_unban')],
        [Markup.button.callback('M3U8 Link Güncelle', 'action_updatelink')]
    ]));
});

// Admin aksiyonları
bot.action('action_ban', (ctx) => {
    ctx.reply('Kullanıcıyı yasaklamak (banlamak) için şu komutu gruba yazın:\n\n/ban FREE-XXXXX\nveya\n/ban <Telegram_ID>');
});

bot.action('action_unban', (ctx) => {
    ctx.reply('Kullanıcının yasağını kaldırmak için şu komutu gruba yazın:\n\n/unban FREE-XXXXX\nveya\n/unban <Telegram_ID>');
});

bot.action('action_updatelink', (ctx) => {
    ctx.reply('Yeni M3U8 linkini şu formatta gruba yazın:\n\n/yenilink http://yenisunucu.com/yayin.m3u8');
});

bot.command('ban', (ctx) => {
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;
    const target = ctx.message.text.replace('/ban ', '').trim();
    if (!target || target === '/ban') return ctx.reply('⚠️ Lütfen banlanacak Kullanıcı Adı veya Telegram ID girin. (Örn: /ban FREE-A1B2C)');

    db.run(`UPDATE users SET status = 'banned' WHERE app_username = ? OR telegram_id = ?`, [target, target], function(err) {
        if (err) return ctx.reply('Veritabanı hatası oluştu.');
        if (this.changes > 0) ctx.reply(`🚫 ✅ Kullanıcı (${target}) başarıyla YASAKLANDI! Artık uygulamaya giremez.`);
        else ctx.reply('❌ Sistemde böyle bir kullanıcı bulunamadı.');
    });
});

bot.command('unban', (ctx) => {
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;
    const target = ctx.message.text.replace('/unban ', '').trim();
    if (!target || target === '/unban') return ctx.reply('⚠️ Lütfen yasağı kaldırılacak Kullanıcı Adı veya Telegram ID girin. (Örn: /unban FREE-A1B2C)');

    db.run(`UPDATE users SET status = 'active' WHERE app_username = ? OR telegram_id = ?`, [target, target], function(err) {
        if (err) return ctx.reply('Veritabanı hatası oluştu.');
        if (this.changes > 0) ctx.reply(`🟢 ✅ Kullanıcı (${target}) yasağı başarıyla KALDIRILDI! Tekrar giriş yapabilir.`);
        else ctx.reply('❌ Sistemde böyle bir kullanıcı bulunamadı.');
    });
});

bot.command('yenilink', (ctx) => {
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;
    const newLink = ctx.message.text.replace('/yenilink ', '').trim();
    if (newLink === '/yenilink' || newLink === '') return ctx.reply('⚠️ Lütfen linki boş bırakmayın.');
    
    db.run(`UPDATE settings SET value = ? WHERE key = 'm3u8_link'`, [newLink], (err) => {
        if (err) return ctx.reply('Hata oluştu.');
        ctx.reply('📺 ✅ M3U8 Linki başarıyla güncellendi. Uygulamadaki herkes yeni yayına geçti!');
    });
});


// --- EXPRESS API SUNUCU KISMI (UYGULAMA İÇİN) ---

app.post('/verify-code', (ctx_req, res) => {
    const { app_username, code } = ctx_req.body;
    if (!app_username || !code) return res.status(400).json({ error: 'Kullanıcı Adı ve Şifre gerekli' });

    db.get(`SELECT * FROM users WHERE app_username = ? AND otp_code = ?`, [app_username, code], (err, user) => {
        if (err) return res.status(500).json({ error: 'Veritabanı hatası' });
        if (!user) return res.status(404).json({ error: 'Geçersiz Kullanıcı Adı veya Şifre' });
        if (user.status === 'banned') return res.status(403).json({ error: 'Hesabınız yasaklanmıştır.' });

        // Kod doğru ve yasaklı değilse linki ver
        db.get(`SELECT value FROM settings WHERE key = 'm3u8_link'`, [], (err, setting) => {
            if (err || !setting) return res.status(500).json({ error: 'Ayar bulunamadı' });
            res.json({ success: true, m3u8_url: setting.value, user_status: user.status });
        });
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Express API sunucusu ${PORT} portunda çalışıyor.`);
function launchBot() {
        bot.launch().then(() => console.log('Telegram Botu çalışmaya başladı!')).catch(err => {
            console.error('Bağlantı hatası (VPN/İnternet):', err.message);
            setTimeout(launchBot, 5000);
        });
    }
    launchBot();
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
