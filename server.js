import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const __dirname = path.resolve();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Conexión a MongoDB
mongoose.connect("mongodb://127.0.0.1:27017/sensores", {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const sensorSchema = new mongoose.Schema({
  fecha: Date,
  humedad: Number,
  temperatura: Number,
  conductividad: Number,
  pH: Number,
  nitrogeno: Number,
  fosforo: Number,
  potasio: Number,
  bateria: Number
});
const Sensor = mongoose.model("Sensor", sensorSchema);

// --- API REST ---
app.get("/api/data/latest", async (req, res) => {
  const data = await Sensor.find().sort({ fecha: -1 }).limit(10);
  res.json(data.reverse());
});

app.get("/api/data/all", async (req, res) => {
  const data = await Sensor.find().sort({ fecha: -1 });
  res.json(data);
});

// --- Socket.IO ---
io.on("connection", async (socket) => {
  console.log("🖥️ Cliente web conectado");
  const ultimos = await Sensor.find().sort({ fecha: -1 }).limit(10).lean();
  socket.emit("historico", ultimos.reverse());
});

// --- Simulación MQTT (si no hay broker real) ---
setInterval(async () => {
  const randomData = {
    fecha: new Date(),
    humedad: Math.random() * 100,
    temperatura: 20 + Math.random() * 10,
    conductividad: Math.random() * 2,
    pH: 6 + Math.random() * 2,
    nitrogeno: Math.random() * 50,
    fosforo: Math.random() * 30,
    potasio: Math.random() * 40,
    bateria: 3.7 + Math.random() * 0.3
  };
  const doc = new Sensor(randomData);
  await doc.save();
  io.emit("nuevoDato", randomData);
}, 10000);

const PORT = 3000;
server.listen(PORT, () => console.log(`✅ Servidor escuchando en http://localhost:${PORT}`));
