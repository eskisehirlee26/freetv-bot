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
        [Markup.button.callback('M3U8 Link Güncelle', 'action_updatelink')],
        [Markup.button.callback('Canlı İstatistikler', 'action_stats'), Markup.button.callback('Kullanıcı Sorgula', 'action_query')],
        [Markup.button.callback('Bakım Modu Yönetimi', 'action_maintenance')]
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

bot.action('action_stats', (ctx) => {
    ctx.reply('İstatistikleri görmek için şu komutu gruba yazın:\n\n/istatistik');
});

bot.action('action_query', (ctx) => {
    ctx.reply('Bir kullanıcıyı sorgulamak için şu komutu gruba yazın:\n\n/sorgula FREE-XXXXX\nveya\n/sorgula <Telegram_ID>');
});

bot.action('action_maintenance', (ctx) => {
    ctx.reply('Sistemi bakıma almak veya bakımdan çıkarmak için şu komutları kullanın:\n\nBakımı Açmak İçin: /bakim ac\nBakımı Kapatmak İçin: /bakim kapat');
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

// BAKIM MODU
bot.command('bakim', (ctx) => {
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;
    const action = ctx.message.text.replace('/bakim ', '').trim().toLowerCase();
    
    if (action === 'ac') {
        db.run(`UPDATE settings SET value = 'true' WHERE key = 'maintenance'`, [], (err) => {
            if (err) return ctx.reply('Hata oluştu.');
            ctx.reply('🛑 DİKKAT: BAKIM MODU AÇILDI! Artık kimse uygulamaya giremez.');
        });
    } else if (action === 'kapat') {
        db.run(`UPDATE settings SET value = 'false' WHERE key = 'maintenance'`, [], (err) => {
            if (err) return ctx.reply('Hata oluştu.');
            ctx.reply('✅ Bakım Modu KAPATILDI! Kullanıcılar tekrar girebilir.');
        });
    } else {
        ctx.reply('⚠️ Kullanım: /bakim ac VEYA /bakim kapat');
    }
});

// KULLANICI DEDEKTİFİ
bot.command('sorgula', (ctx) => {
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;
    const target = ctx.message.text.replace('/sorgula ', '').trim();
    if (!target || target === '/sorgula') return ctx.reply('⚠️ Kullanım: /sorgula FREE-XXXXX');

    db.get(`SELECT * FROM users WHERE app_username = ? OR telegram_id = ?`, [target, target], (err, user) => {
        if (err) return ctx.reply('Veritabanı hatası.');
        if (!user) return ctx.reply('❌ Böyle bir kullanıcı bulunamadı.');

        const info = `
🔍 **KULLANICI SORGUSU**
ID: ${user.id}
Telegram ID: ${user.telegram_id}
Telegram Adı: @${user.username || 'Gizli'}
Uygulama Kodu: ${user.app_username}
Durum: ${user.status === 'active' ? '🟢 Aktif' : '🔴 BANLI'}
Kayıt Tarihi: ${new Date(user.created_at).toLocaleString('tr-TR')}
        `;
        ctx.reply(info, { parse_mode: 'Markdown' });
    });
});

// CANLI İSTATİSTİKLER
bot.command('istatistik', (ctx) => {
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;
    
    db.get(`SELECT 
        COUNT(*) as total, 
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) as banned
        FROM users`, [], (err, stats) => {
        
        if (err) return ctx.reply('Veritabanı hatası.');
        
        const report = `
📊 **SİSTEM İSTATİSTİKLERİ**
Toplam Kayıtlı Üye: ${stats.total || 0}
🟢 Aktif Üyeler: ${stats.active || 0}
🔴 Banlı Üyeler: ${stats.banned || 0}
        `;
        ctx.reply(report, { parse_mode: 'Markdown' });
    });
});


// --- EXPRESS API SUNUCU KISMI (UYGULAMA İÇİN) ---

// Güvenlik İhlali ve Otomatik Ban Endpoint'i
app.post('/report-security-violation', (req, res) => {
    const { app_username, threat_type, details } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!app_username) return res.status(400).json({ error: 'Geçersiz veri' });

    // 1. Kullanıcıyı anında veritabanında BANLA
    db.run(
        `UPDATE users SET status = 'banned' WHERE app_username = ?`,
        [app_username],
        function(err) {
            if (err) console.error('Banlama hatası:', err);

            // 2. Kullanıcı bilgilerini çekip Telegram Admin Grubuna Kırmızı Alarm Gönder
            db.get(`SELECT * FROM users WHERE app_username = ?`, [app_username], (err, user) => {
                if (ADMIN_GROUP_ID && user) {
                    const alarmMessage = `
🚨🚨 **ACİL GÜVENLİK ALARMI: AĞ DİNLEME TESPİT EDİLDİ!** 🚨🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 **Kullanıcı:** @${user.username || 'Bilinmiyor'} (ID: ${user.telegram_id || 'Bilinmiyor'})
📱 **Uygulama Kodu:** \`${app_username}\`
⚠️ **Tehdit Türü:** \`${threat_type}\`
🔍 **Detay:** ${details || 'HttpCanary / Proxy tespit edildi'}
🌐 **Saldırgan IP:** \`${clientIp}\`
🛑 **Sistem Aksiyonu:** Kullanıcı hesabı **OTOMATİK VE KALICI OLARAK BANLANDI!**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    `;
                    bot.telegram.sendMessage(ADMIN_GROUP_ID, alarmMessage, { parse_mode: 'Markdown' }).catch(e => console.log('Telegram Mesaj Hatası:', e));
                }
            });

            res.json({ success: true, message: 'İhlal kaydedildi ve hesap askıya alındı.' });
        }
    );
});

app.post('/verify-code', (ctx_req, res) => {
    const { app_username, code } = ctx_req.body;
    if (!app_username || !code) return res.status(400).json({ error: 'Kullanıcı Adı ve Şifre gerekli' });

    // Önce Bakım Modu açık mı kontrol et
    db.get(`SELECT value FROM settings WHERE key = 'maintenance'`, [], (err, maintenanceSetting) => {
        if (err) return res.status(500).json({ error: 'Veritabanı hatası' });
        
        if (maintenanceSetting && maintenanceSetting.value === 'true') {
            return res.status(503).json({ error: 'BAKIM_MODU', message: 'Sistem şu an bakımdadır, lütfen daha sonra tekrar deneyin.' });
        }

        // Bakım modu kapalıysa normal giriş yap
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
});

const PORT = process.env.PORT || 3000;
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
