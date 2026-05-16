const { Client } = require('pg');

// Configuración de PostgreSQL
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

let isDbConnected = false;

// Función para crear la tabla si no existe
async function initDatabase() {
  const createTableSQL = `
  CREATE TABLE IF NOT EXISTS telemetria (
    id SERIAL PRIMARY KEY,
    id_vitrina INT NOT NULL,
    id_punto INT NOT NULL,
    suelo_val INT,
    aire_hum_pct INT,
    aire_temp_c INT,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  `;
  try {
    await client.query(createTableSQL);
    console.log("📊 Estructura DB: Tabla 'telemetria' VERIFICADA/CREADA.");
  } catch (err) {
    console.error("❌ Error al inicializar la tabla:", err.message);
  }
}

// Función para manejar la conexión con reintentos automáticos
async function connectDB() {
  while (!isDbConnected) {
    try {
      await client.connect();
      isDbConnected = true;
      console.log("✅ Sistema de Base de Datos: CONECTADO");

      // Una vez conectados, aseguramos que la tabla exista
      await initDatabase();

    } catch (err) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

connectDB();

const vitrinaActual = process.argv[2] ? parseInt(process.argv[2]) : 1;
console.log(`🚀 Monitoreo Activo - Vitrina: ${vitrinaActual}`);
console.log(`📡 Escuchando red 'Vitrinas_IOT'...`);
console.log(`────────────────────────────────────────────────────────────`);

setInterval(async () => {
  if (!isDbConnected) return;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch('http://192.168.4.1/datos', { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return;

    const data = await response.text();
    const partes = data.trim().split(',');

    if (partes.length === 4) {
      const [s1, s2, aire, temp] = partes.map(Number);
      const hora = new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' });

      console.log(`[${hora}] 📥 Suelo1: ${s1} | Suelo2: ${s2} | Hum: ${aire}% | Temp: ${temp}°C`);

      await client.query('INSERT INTO telemetria (id_vitrina, id_punto, suelo_val, aire_hum_pct, aire_temp_c) VALUES ($1, 1, $2, $3, $4)',
                         [vitrinaActual, s1, aire, temp]);

      await client.query('INSERT INTO telemetria (id_vitrina, id_punto, suelo_val, aire_hum_pct, aire_temp_c) VALUES ($1, 2, $2, $3, $4)',
                         [vitrinaActual, s2, aire, temp]);
    }
  } catch (error) {
    // Silencio para errores de red del ESP32, pero si es un error de base de datos lo avisamos
    if (error.message && error.message.includes('telemetria')) {
      console.error("❌ Error interno de DB:", error.message);
    }
  }
}, 10000);
