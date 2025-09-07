import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const MP_TOKEN = process.env.MP_TOKEN; // Access Token do Mercado Pago (produção)
const ESP32_NOTIFY_URL = process.env.ESP32_NOTIFY_URL || ""; // opcional: URL do ESP32 para notificação POST

if(!MP_TOKEN) {
  console.error("ERRO: configure MP_TOKEN no .env");
  process.exit(1);
}

/**
 * Cria pagamento PIX via Mercado Pago
 */
app.post("/pagar", async (req, res) => {
  try {
    const { total, referencia } = req.body;
    const amount = parseFloat(total);
    if (!amount || amount <= 0) return res.status(400).json({ error: "Total inválido" });

    const payload = {
      transaction_amount: amount,
      description: referencia || "Compra Mini Mercado Bacuri",
      payment_method_id: "pix",
      payer: { email: "comprador@exemplo.com" }
    };

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Authorization": Bearer ${MP_TOKEN},
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await mpRes.json();

    if (!mpRes.ok) {
      console.error("MP error:", data);
      return res.status(500).json({ error: "Erro Mercado Pago", details: data });
    }

    const tx = data.point_of_interaction?.transaction_data;
    if (!tx) {
      return res.status(500).json({ error: "Resposta inesperada Mercado Pago", data });
    }

    res.json({
      qr_code_base64: tx.qr_code_base64,
      qr_code: tx.qr_code,
      payment_id: data.id
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/**
 * Consulta status do pagamento Mercado Pago
 */
app.get("/status/:payment_id", async (req, res) => {
  const payment_id = req.params.payment_id;
  if (!payment_id) return res.status(400).json({ error: "payment_id requerido" });

  try {
    const mpRes = await fetch(https://api.mercadopago.com/v1/payments/${payment_id}, {
      method: "GET",
      headers: { "Authorization": Bearer ${MP_TOKEN} }
    });
    const data = await mpRes.json();
    if (!mpRes.ok) {
      return res.status(500).json({ error: "Erro Mercado Pago", details: data });
    }

    res.json({ status: data.status, id: data.id, data });
    
    if (data.status === "approved" && ESP32_NOTIFY_URL) {
      try {
        await fetch(ESP32_NOTIFY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_id: data.id, status: data.status })
        });
        console.log("Notificado ESP32:", ESP32_NOTIFY_URL);
      } catch(e) {
        console.warn("Falha ao notificar ESP32:", e.message);
      }
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/**
 * NOVO: Servir a página public_index.html
 */
const publicPath = path.join(__dirname, ".");
app.use(express.static(publicPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "public_index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(✅ Server rodando em http://localhost:${PORT}));
