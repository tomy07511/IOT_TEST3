import express from "express";
import mongoose from "mongoose";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// 📦 Conexión MongoDB
mongoose.connect("mongodb://localhost:27017/sensores", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// 📊 Esquema con las 8 variables del LoRa
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

// 🧩 Endpoint: últimos 10 registros para las gráficas
app.get("/api/data/latest", async (req, res) => {
  try {
    const data = await Sensor.find().sort({ fecha: -1 }).limit(10);
    res.json(data.reverse()); // Se invierte para mostrar de viejo → nuevo
  } catch (err) {
    res.status(500).json({ error: "Error obteniendo los datos" });
  }
});

// 📋 Endpoint: todos los registros (para tabla con paginación)
app.get("/api/data/all", async (req, res) => {
  try {
    const data = await Sensor.find().sort({ fecha: -1 }); // Todos los datos, nuevos primero
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Error obteniendo todos los datos" });
  }
});

app.listen(3000, () => console.log("✅ Servidor corriendo en puerto 3000"));
