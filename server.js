import express from "express";
import http from "http";
import { Server } from "socket.io";
import mqtt from "mqtt";
import path from "path";
import { fileURLToPath } from "url";

// Configuración de rutas
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir dashboard desde /public
app.use(express.static(path.join(__dirname, "public")));

// 🟢 Conexión al broker MQTT (puedes usar test.mosquitto.org o broker.hivemq.com)
const broker = "mqtt://broker.hivemq.com:1883";
const client = mqtt.connect(broker);

// Tema donde el ESP32 publicará
const topic = "dan/esp32/datos";

client.on("connect", () => {
  console.log("Conectado al broker MQTT");
  client.subscribe(topic);
});

client.on("message", (topic, message) => {
  const data = JSON.parse(message.toString());
  console.log("Datos recibidos:", data);
  io.emit("update", data); // Enviar al dashboard web
});

server.listen(3000, () => {
  console.log("Servidor en http://localhost:3000");
});