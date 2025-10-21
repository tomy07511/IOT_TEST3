import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import mqtt from "mqtt";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

app.use(cors());
app.use(express.json());

const mongoUri = "mongodb+srv://daruksalem:sopa123@cluster0.jakv4ny.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(mongoUri)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch(err => console.error("❌ Error conectando a MongoDB:", err));

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

// 🔹 MQTT
const mqttClient = mqtt.connect("mqtt://broker.hivemq.com:1883");

mqttClient.on("connect", () => {
  console.log("✅ Conectado al broker MQTT");
  mqttClient.subscribe("dan/esp32/datos");
});

mqttClient.on("message", async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log("📥 Mensaje recibido:", data);

    const sensor = new Sensor(data);
    await sensor.save();
    console.log("💾 Guardado en MongoDB");

    // 🔹 Enviar el nuevo dato a todos los clientes conectados
    io.emit("nuevoDato", data);

  } catch (err) {
    console.error("❌ Error procesando mensaje:", err);
  }
});

app.get("/api/data/latest", async (req, res) => {
  const data = await Sensor.find().sort({ fecha: -1 }).limit(10);
  res.json(data.reverse());
});

app.get("/api/data/all", async (req, res) => {
  const data = await Sensor.find().sort({ fecha: -1 });
  res.json(data);
});

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`✅ Servidor corriendo en puerto ${PORT}`));

io.on("connection", (socket) => {
  console.log("🖥️ Cliente conectado al socket");
});
