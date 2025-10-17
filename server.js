import express from "express";
import http from "http";
import { Server } from "socket.io";
import mqtt from "mqtt";
import path from "path";
import { fileURLToPath } from "url";

// 🔹 Configuración de ruta
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔹 Inicializar Express y servidor HTTP
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 🔹 Archivos estáticos (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, "public")));

// 🔹 Broker MQTT público (o el tuyo si lo cambias)
const mqttServer = "mqtt://broker.hivemq.com";
const topic = "dan/esp32/datos";
const client = mqtt.connect(mqttServer);

// 🟢 Conexión al broker MQTT
client.on("connect", () => {
  console.log("✅ Conectado al broker MQTT");
  client.subscribe(topic, (err) => {
    if (!err) console.log("📡 Suscrito al topic:", topic);
  });
});

// 🧩 Cuando llega un mensaje MQTT
client.on("message", (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log("📥 Datos recibidos:", data);
    io.emit("mqtt_message", data);
  } catch (e) {
    console.error("❌ Error procesando mensaje MQTT:", e);
  }
});

// 🔹 Socket.io para el cliente web
io.on("connection", (socket) => {
  console.log("🖥️ Cliente conectado");
  socket.on("disconnect", () => console.log("🔌 Cliente desconectado"));
});

// 🔹 Iniciar servidor HTTP
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
