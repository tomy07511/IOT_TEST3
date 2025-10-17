import express from "express";
import http from "http";
import { Server } from "socket.io";
import mqtt from "mqtt";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

// 🟢 Servir tu frontend
app.use(express.static(path.join(__dirname, "public")));

// 🟢 Conectarse al mismo broker y topic que el ESP32
const client = mqtt.connect("mqtt://broker.hivemq.com");
const topic = "dan/esp32/datos";

client.on("connect", () => {
  console.log("🌐 Conectado al broker MQTT");
  client.subscribe(topic, () => {
    console.log(`📡 Suscrito al tópico: ${topic}`);
  });
});

client.on("message", (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log("📦 Datos recibidos:", data);
    io.emit("mqtt_message", data); // 🔥 Enviar a las gráficas
  } catch (err) {
    console.error("❌ Error al parsear:", err);
  }
});

server.listen(PORT, () => console.log(`🚀 Servidor corriendo en
