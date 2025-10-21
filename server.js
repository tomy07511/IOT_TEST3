import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import mqtt from "mqtt";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ================== CONFIG ==================
const PORT = process.env.PORT || 10000;
const MONGO_URI = "mongodb+srv://daruksalem:sopa123@cluster0.jakv4ny.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"; // <-- reemplaza esto con tu cadena de conexión real de MongoDB Atlas
const MQTT_BROKER = "mqtt://test.mosquitto.org";
const MQTT_TOPIC = "esp32/datos";

// ================== MONGODB ==================
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB"))
  .catch((err) => console.error("❌ Error conectando a MongoDB:", err));

const sensorSchema = new mongoose.Schema({
  temperatura: Number,
  humedad: Number,
  fecha: { type: Date, default: Date.now }
});

const Sensor = mongoose.model("Sensor", sensorSchema);

// ================== MQTT ==================
const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on("connect", () => {
  console.log("📡 Conectado al broker MQTT");
  mqttClient.subscribe(MQTT_TOPIC, (err) => {
    if (!err) console.log(`🟢 Suscrito al topic: ${MQTT_TOPIC}`);
    else console.error("❌ Error al suscribirse:", err);
  });
});

mqttClient.on("message", async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log(`📥 Datos MQTT recibidos:`, data);

    const nuevoDato = new Sensor({
      temperatura: data.temperatura,
      humedad: data.humedad
    });
    await nuevoDato.save();

    // Emitir a todos los clientes conectados en tiempo real
    io.emit("nuevo_dato", nuevoDato);
  } catch (error) {
    console.error("❌ Error procesando mensaje MQTT:", error);
  }
});

// ================== SERVIDOR WEB ==================
app.use(express.static(path.join(__dirname, "public")));

io.on("connection", async (socket) => {
  console.log("🖥️ Cliente web conectado");

  const ultimos = await Sensor.find().sort({ fecha: -1 }).limit(10).lean();
  socket.emit("historico", ultimos.reverse());
});

server.listen(PORT, () => console.log(`✅ Servidor corriendo en puerto ${PORT}`));
