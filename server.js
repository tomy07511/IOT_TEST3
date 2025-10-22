import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import mqtt from "mqtt";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

// ==============================
// 🔹 Configuración base
// ==============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ==============================
// 🔹 Conexión a MongoDB
// ==============================
const mongoUri = "mongodb+srv://daruksalem:sopa123@cluster0.jakv4ny.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(mongoUri)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch(err => console.error("❌ Error conectando a MongoDB:", err));

// ==============================
// 📊 Esquema del sensor
// ==============================
const sensorSchema = new mongoose.Schema({
  humedad: Number,
  temperatura: Number,
  conductividad: Number,
  ph: Number,
  nitrogeno: Number,
  fosforo: Number,
  potasio: Number,
  bateria: Number,
  fecha: { type: Date, default: Date.now },
});

const Sensor = mongoose.model("Sensor", sensorSchema);

// ==============================
// 🔹 Conexión al Broker MQTT
// ==============================
const mqttClient = mqtt.connect("mqtt://broker.hivemq.com:1883");

mqttClient.on("connect", () => {
  console.log("✅ Conectado al broker MQTT");
  mqttClient.subscribe("dan/esp32/datos", (err) => {
    if (err) console.error("❌ Error suscribiéndose al topic:", err);
    else console.log("📡 Suscrito al topic 'dan/esp32/datos'");
  });
});

mqttClient.on("error", (err) => {
  console.error("❌ Error MQTT:", err);
});

// ==============================
// 🔹 Recepción de datos MQTT
// ==============================
mqttClient.on("message", async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log("📥 Mensaje recibido:", data);

    const sensor = new Sensor({
      humedad: data.humedad,
      temperatura: data.temperatura,
      conductividad: data.conductividad,
      ph: data.ph,
      nitrogeno: data.nitrogeno,
      fosforo: data.fosforo,
      potasio: data.potasio,
      bateria: data.bateria,
    });

    await sensor.save();
    console.log("💾 Guardado en MongoDB");

    io.emit("nuevoDato", sensor); // Envía el registro completo
    console.log("📡 Dato emitido en tiempo real");
  } catch (err) {
    console.error("❌ Error procesando mensaje MQTT:", err);
  }
});

// ==============================
// 🔹 Conexión Socket.IO
// ==============================
io.on("connection", async (socket) => {
  console.log("🖥️ Cliente conectado a Socket.IO");

  try {
    // Envía los 10 registros más recientes directamente en orden DESC
    const ultimos = await Sensor.find().sort({ fecha: -1 }).limit(10).lean();
    socket.emit("historico", ultimos); // sin reverse()
  } catch (err) {
    console.error("❌ Error enviando histórico:", err);
  }

  socket.on("disconnect", () => console.log("❌ Cliente desconectado"));
});

// ==============================
// 🔹 Endpoints REST
// ==============================

// Últimos 10 registros (más recientes primero)
app.get("/api/data/latest", async (req, res) => {
  try {
    const data = await Sensor.find().sort({ fecha: -1 }).limit(10);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Error obteniendo los datos" });
  }
});

// Todos los registros (más recientes primero)
app.get("/api/data/all", async (req, res) => {
  try {
    const data = await Sensor.find().sort({ fecha: -1 }).lean();
    res.json(data);
  } catch (err) {
    console.error("❌ Error obteniendo todos los datos:", err);
    res.status(500).json({ error: "Error obteniendo los datos" });
  }
});

// ==============================
// 🔹 Iniciar servidor
// ==============================
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () =>
  console.log(`✅ Servidor corriendo en puerto ${PORT}`)
);
