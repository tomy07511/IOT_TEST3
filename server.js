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
const io = new Server(httpServer);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ==============================
// 🔹 Conexión a MongoDB Atlas
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

    // 🔹 Emitir al frontend en tiempo real
    io.emit("nuevoDato", data);
    console.log("📡 Enviado a clientes en tiempo real");

  } catch (err) {
    console.error("❌ Error procesando mensaje MQTT:", err);
  }
});

// ==============================
// 🔹 Endpoints HTTP
// ==============================
app.get("/api/data/latest", async (req, res) => {
  try {
    const data = await Sensor.find().sort({ fecha: -1 }).limit(10);
    res.json(data.reverse());
  } catch (err) {
    res.status(500).json({ error: "Error obteniendo los datos" });
  }
});

app.get("/api/data/all", async (req, res) => {
  try {
    const data = await Sensor.find().sort({ fecha: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Error obteniendo todos los datos" });
  }
});

// ==============================
// 🔹 Inicializar servidor
// ==============================
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`✅ Servidor corriendo en puerto ${PORT}`));
