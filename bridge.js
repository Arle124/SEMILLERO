const { Pool } = require('pg');
const admin = require('firebase-admin');

let db = null;
let firebaseInitialized = false;

// Inicialización condicional y segura de Firebase
try {
  const serviceAccount = require('./vitrinasiot-firebase-adminsdk-fbsvc-0201f15c59.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  db = admin.firestore();
  firebaseInitialized = true;
  console.log("☁️  Firebase: Conectado e inicializado correctamente.");
} catch (err) {
  console.warn("⚠️  Aviso: No se encontró el archivo de credenciales de Firebase ('vitrinasiot-firebase-adminsdk-fbsvc-0201f15c59.json') o es inválido.");
  console.warn("👉  El puente funcionará en modo LOCAL (PostgreSQL exclusivo). Los datos NO se sincronizarán con la nube de Firebase.");
}

// Configuración de PostgreSQL usando Pool
const pool = new Pool({
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
    await pool.query(createTableSQL);
    console.log("📊 Estructura DB: Tabla 'telemetria' VERIFICADA/CREADA.");
    isDbConnected = true;
  } catch (err) {
    console.error("❌ Error al inicializar la tabla:", err.message);
    isDbConnected = false;
  }
}

// Función para verificar y reconectar
async function checkDBConnection() {
  while (!isDbConnected) {
    try {
      // Una consulta simple para comprobar la conexión
      await pool.query('SELECT 1');
      console.log("✅ Sistema de Base de Datos: CONECTADO");
      await initDatabase();
    } catch (err) {
      console.error("⏳ Esperando conexión con PostgreSQL...");
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

checkDBConnection();

const vitrinaActual = process.env.VITRINA_ID ? parseInt(process.env.VITRINA_ID) : (process.argv[2] ? parseInt(process.argv[2]) : 1);
const esp32Url = process.env.ESP32_URL || 'http://192.168.4.1/datos';

console.log(`🚀 Monitoreo Activo - Vitrina: ${vitrinaActual}`);
console.log(`📡 Escuchando microcontrolador en: ${esp32Url}`);
console.log(`────────────────────────────────────────────────────────────`);

// Estado del dispositivo en Firebase (solo si está disponible)
const statusRef = firebaseInitialized ? db.collection('estado').doc('dispositivo') : null;

setInterval(async () => {
  if (!isDbConnected) {
    // Si la base de datos Postgres local cayó, intentamos reconectar
    checkDBConnection();
    return;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(esp32Url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Respuesta HTTP no exitosa: ${response.status}`);
    }

    const data = await response.text();
    const partes = data.trim().split(',');

    if (partes.length === 4) {
      const [s1, s2, aire, temp] = partes.map(Number);
      const hora = new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' });

      console.log(`[${hora}] 📥 Suelo1: ${s1} | Suelo2: ${s2} | Hum: ${aire}% | Temp: ${temp}°C`);

      // Guardado en PostgreSQL (Local) usando el Pool
      await pool.query('INSERT INTO telemetria (id_vitrina, id_punto, suelo_val, aire_hum_pct, aire_temp_c) VALUES ($1, 1, $2, $3, $4)',
                         [vitrinaActual, s1, aire, temp]);

      await pool.query('INSERT INTO telemetria (id_vitrina, id_punto, suelo_val, aire_hum_pct, aire_temp_c) VALUES ($1, 2, $2, $3, $4)',
                         [vitrinaActual, s2, aire, temp]);

      // Guardado en Firebase Firestore (Nube) - Solo si está inicializado
      if (firebaseInitialized) {
        try {
          const registroRef = db.collection('telemetria').doc();
          await registroRef.set({
            id_vitrina: vitrinaActual,
            suelo1: s1,
            suelo2: s2,
            aire_hum: aire,
            aire_temp: temp,
            fecha: admin.firestore.Timestamp.now()
          });
          console.log("☁️  Datos sincronizados con Firebase");
        } catch (fErr) {
          console.error("⚠️ Error sincronizando con Firebase:", fErr.message);
        }
      }

      // Actualizar estado del dispositivo a ONLINE - Solo si Firebase está inicializado
      if (firebaseInitialized && statusRef) {
        try {
          await statusRef.set({
            online: true,
            lastSeen: admin.firestore.Timestamp.now(),
            vitrina_activa: vitrinaActual
          }, { merge: true });
        } catch (sErr) {
          console.error("⚠️ Error al actualizar estado del dispositivo a online:", sErr.message);
        }
      }
    } else {
      console.warn("⚠️ Datos del ESP32 recibidos con formato incorrecto:", data);
    }
  } catch (error) {
    console.error(`⚠️ ESP32 fuera de línea o error en bridge: ${error.message}`);
    // Actualizar estado del dispositivo a OFFLINE en Firebase - Solo si está inicializado
    if (firebaseInitialized && statusRef) {
      try {
        await statusRef.set({
          online: false,
          lastSeen: admin.firestore.Timestamp.now()
        }, { merge: true });
      } catch (sErr) {
        console.error("⚠️ Error al actualizar estado del dispositivo a offline:", sErr.message);
      }
    }
  }
}, 10000);
