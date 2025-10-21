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

// 📊 Esquema del sensor LoRa
const sensorSchema = new mongoose.Schema({
  humedad: Number,
  temperatura: Number,
  conductividad: Number,
  pH: Number,
  nitrogeno: Number,
  fosforo: Number,
  potasio: Number,
  bateria: Number,
  fecha: { type: Date, default: Date.now },
});

const Sensor = mongoose.model("Sensor", sensorSchema);

// 🔹 Conexión MQTT
const mqttClient = mqtt.connect("mqtt://TU_BROKER:PUERTO"); // Ej: mqtt://broker.hivemq.com:1883

mqttClient.on("connect", () => {
  console.log("✅ Conectado al broker MQTT");
  mqttClient.subscribe("sensor/loRa", (err) => {
    if (err) console.error("❌ Error suscribiéndose al topic MQTT:", err);
    else console.log("📡 Suscrito al topic 'sensor/loRa'");
  });
});

mqttClient.on("error", (err) => {
  console.error("❌ Error MQTT:", err);
});

mqttClient.on("message", async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log("📥 Mensaje recibido:", data);

    // Guardar en MongoDB
    const sensor = new Sensor({
      humedad: data.humedad,
      temperatura: data.temperatura,
      conductividad: data.conductividad,
      pH: data.pH,
      nitrogeno: data.nitrogeno,
      fosforo: data.fosforo,
      potasio: data.potasio,
      bateria: data.bateria
    });

    await sensor.save();
    console.log("💾 Datos guardados en MongoDB");
  } catch (err) {
    console.error("❌ Error procesando mensaje MQTT:", err);
  }
});

// 🧩 Endpoints
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

// Servir archivos estáticos
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor corriendo en puerto ${PORT}`));
