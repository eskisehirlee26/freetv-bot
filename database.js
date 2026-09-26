const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.vlnfxauezsyomqztgjjc:90922152Emre@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

pool.connect((err, client, release) => {
  if (err) {
    return console.error('Supabase veritabanına bağlanılamadı:', err.message);
  }
  console.log('✅ Supabase PostgreSQL veritabanına başarıyla bağlanıldı.');
  release();
  initDb();
});

async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id TEXT UNIQUE,
        username TEXT,
        app_username TEXT UNIQUE,
        otp_code TEXT UNIQUE,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    await pool.query(`
      INSERT INTO settings (key, value) 
      VALUES ('m3u8_link', 'http://ornekpanel.com:8080/live/user/pass/stream.m3u8')
      ON CONFLICT (key) DO NOTHING
    `);
    
    console.log('✅ Veritabanı tabloları hazır.');
  } catch (err) {
    console.error('Tablo oluşturma hatası:', err.message);
  }
}

// SQLite tarzı fonksiyonları PostgreSQL'e çeviren yardımcı sarmalayıcı (Wrapper)
module.exports = {
  get: async (sql, params, callback) => {
    try {
      // ? işaretlerini $1, $2, vs. formatına çevir
      let counter = 1;
      const pgSql = sql.replace(/\?/g, () => `$${counter++}`);
      const res = await pool.query(pgSql, params);
      callback(null, res.rows[0]);
    } catch (err) {
      callback(err, null);
    }
  },
  run: async (sql, params, callback) => {
    try {
      let counter = 1;
      const pgSql = sql.replace(/\?/g, () => `$${counter++}`);
      const res = await pool.query(pgSql, params || []);
      // SQLite'taki `this.changes` yapısını simüle etmek için bind bağlamı
      if(callback) callback.bind({ changes: res.rowCount })(null);
    } catch (err) {
      if(callback) callback(err);
    }
  }
};
