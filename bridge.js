const { Pool } = require('pg');
const admin = require('firebase-admin');
const express = require('express');

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

// Inicialización de Express
const app = express();
app.use(express.json()); // Parser de JSON para el body de las peticiones

let lastPostTime = Date.now(); // Marca de tiempo del último POST recibido
let isDeviceOnline = false;    // Estado actual del dispositivo en Firebase

// --- RUTINA DE WATCHDOG INDEPENDIENTE (setInterval) ---
// Cambia el flag 'online' de 'estado/dispositivo' a false en Firebase si pasan más de 15 segundos sin peticiones del ESP32
setInterval(async () => {
  if (firebaseInitialized && isDeviceOnline && (Date.now() - lastPostTime > 15000)) {
    try {
      isDeviceOnline = false;
      const statusRef = db.collection('estado').doc('dispositivo');
      await statusRef.set({
        online: false,
        lastSeen: admin.firestore.Timestamp.now()
      }, { merge: true });
      console.log("🐕 Watchdog: ESP32 fuera de línea (más de 15s sin telemetría). Estado actualizado en Firebase.");
    } catch (err) {
      console.error("⚠️ Error en Watchdog al marcar fuera de línea en Firebase:", err.message);
    }
  }
}, 5000); // Chequea cada 5 segundos

// --- ENDPOINT POST /api/datos ---
// Recibe la telemetría en JSON, la inserta en Postgres y Firebase, y responde con el estado de la bomba
app.post('/api/datos', async (req, res) => {
  try {
    const { suelo1, suelo2, humedad, temperatura } = req.body;

    // Validación básica de parámetros
    if (suelo1 === undefined || suelo2 === undefined || humedad === undefined || temperatura === undefined) {
      console.warn("⚠️ Advertencia: POST recibido con parámetros incompletos:", req.body);
      return res.status(400).send("Faltan parámetros en el JSON de telemetría.");
    }

    const s1 = parseInt(suelo1);
    const s2 = parseInt(suelo2);
    const aire = parseInt(humedad);
    const temp = parseInt(temperatura);

    // Actualizar la marca de tiempo de recepción para el watchdog
    lastPostTime = Date.now();

    const hora = new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' });
    console.log(`[${hora}] 📥 POST Recibido | Suelo1: ${s1} | Suelo2: ${s2} | Hum: ${aire}% | Temp: ${temp}°C`);

    // a) Insertar los datos en PostgreSQL usando el pool existente (por duplicado para punto 1 y punto 2)
    if (isDbConnected) {
      try {
        await pool.query('INSERT INTO telemetria (id_vitrina, id_punto, suelo_val, aire_hum_pct, aire_temp_c) VALUES ($1, 1, $2, $3, $4)',
                           [vitrinaActual, s1, aire, temp]);
        await pool.query('INSERT INTO telemetria (id_vitrina, id_punto, suelo_val, aire_hum_pct, aire_temp_c) VALUES ($1, 2, $2, $3, $4)',
                           [vitrinaActual, s2, aire, temp]);
        console.log("📊 Postgres: Telemetría guardada.");
      } catch (pgErr) {
        console.error("❌ Postgres: Error al insertar datos:", pgErr.message);
      }
    }

    // b) Insertar los datos en Firebase Firestore
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
        console.log("☁️  Firebase: Telemetría sincronizada.");

        // Si el estado anterior era offline, actualizarlo a online en Firestore
        if (!isDeviceOnline) {
          isDeviceOnline = true;
          const statusRef = db.collection('estado').doc('dispositivo');
          await statusRef.set({
            online: true,
            lastSeen: admin.firestore.Timestamp.now(),
            vitrina_activa: vitrinaActual
          }, { merge: true });
          console.log("🐕 Watchdog: ESP32 online. Estado actualizado en Firebase.");
        }
      } catch (fErr) {
        console.error("⚠️ Firebase: Error al guardar datos o actualizar estado online:", fErr.message);
      }
    }

    // c) Consultar el documento 'estado/bomba' en Firestore y responder inmediatamente con "ON" u "OFF"
    let bombaRespuesta = "OFF";
    if (firebaseInitialized) {
      try {
        const bombaDoc = await db.collection('estado').doc('bomba').get();
        if (bombaDoc.exists) {
          const data = bombaDoc.data();
          if (data && data.encendida === true) {
            bombaRespuesta = "ON";
          }
        }
      } catch (fErr) {
        console.error("⚠️ Firebase: Error al consultar estado de bomba:", fErr.message);
      }
    }

    // Responder de inmediato con la respuesta de texto plano "ON" o "OFF"
    res.send(bombaRespuesta);

  } catch (error) {
    console.error("❌ Error en Express procesando POST:", error.message);
    res.status(500).send("Error interno del servidor puente.");
  }
});

// Escuchar en el puerto 3000 y aceptar conexiones externas (0.0.0.0)
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor Express del puente activo en puerto ${PORT}`);
  console.log(`🚀 Monitoreo Activo - Vitrina: ${vitrinaActual}`);
  console.log(`────────────────────────────────────────────────────────────`);
});
