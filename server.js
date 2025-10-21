// server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 Conexión a MongoDB Atlas
// ⚠️ Reemplaza TU_USUARIO, TU_CLAVE y MI_CLUSTER por tus datos reales
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

// 🧩 Endpoint: últimos 10 registros
app.get("/api/data/latest", async (req, res) => {
  try {
    const data = await Sensor.find().sort({ fecha: -1 }).limit(10);
    res.json(data.reverse()); // viejo -> nuevo
  } catch (err) {
    res.status(500).json({ error: "Error obteniendo los datos" });
  }
});

// 📋 Endpoint: todos los registros
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
