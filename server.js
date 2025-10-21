import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import mqtt from "mqtt";

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 Conexión a MongoDB Atlas
const mongoUri = "mongodb+srv://daruksalem:sopa123@cluster0.jakv4ny.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(mongoUri)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch(err => console.error("❌ Error conectando a MongoDB:", err));

// 📊 Esquema de datos del LoRa
const sensorSchema = new mongoose.Schema({
  humedad: Number,
  temperatura: Number,
  conductividad: Number,
  ph: Number,
  nitrogeno: Number,
  fosforo: Number,
  potasio: Number,
  bateria: Number,
  rssi: Number,
  fecha: { type: Date, default: Date.now },
});
const Sensor = mongoose.model("Sensor", sensorSchema);

// 🔹 Conexión MQTT (mismo broker y topic que tu ESP32)
const mqttClient = mqtt.connect("mqtt://broker.hivemq.com:1883");

mqttClient.on("connect", () => {
  console.log("✅ Conectado al broker MQTT HiveMQ");
  mqttClient.subscribe("dan/esp32/datos", (err) => {
    if (err) console.error("❌ Error al suscribirse:", err);
    else console.log("📡 Suscrito al topic: dan/esp32/datos");
  });
});

mqttClient.on("error", (err) => {
  console.error("❌ Error MQTT:", err);
});

// 📥 Cuando llegan datos desde el ESP32
mqttClient.on("message", async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log("📩 Mensaje MQTT recibido:", data);

    // Guardar en MongoDB
    const sensor = new Sensor(data);
    await sensor.save();
    console.log("💾 Datos guardados en MongoDB correctamente");
  } catch (err) {
    console.error("❌ Error procesando mensaje MQTT:", err);
  }
});

// 🧩 Endpoints REST
app.get("/api/data/latest", async (req, res) => {
  try {
    const data = await Sensor.find().sort({ fecha: -1 }).limit(10);
    res.json(data.reverse());
  } catch (err) {
    res.status(500).json({ error: "Error obteniendo los últimos datos" });
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

// Servir archivos estáticos (mantiene tu estilo azul/cyan original)
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor corriendo en puerto ${PORT}`));
