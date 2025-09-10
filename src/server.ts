import express, { Request, Response } from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { PRODUCTS } from "./products"; // <-- importa seus produtos

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// ------------------------ VARIÁVEIS DE AMBIENTE ------------------------
const PORT = process.env.PORT || 3000;
const MP_TOKEN = process.env.MP_TOKEN || "";
const ESP32_NOTIFY_URL = process.env.ESP32_NOTIFY_URL || "";

// ------------------------ PAGAMENTO PIX ------------------------
app.post("/pagar", async (req: Request, res: Response) => {
  try {
    const body = req.body;

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_TOKEN}`,
      },
      body: JSON.stringify({
        transaction_amount: body.valor,
        description: body.descricao || "Compra no Mini Mercado Bacuri",
        payment_method_id: "pix",
        payer: { email: body.email },
      }),
    });

    const data: any = await mpRes.json();

    if (!mpRes.ok) {
      return res.status(500).json({ error: "Erro Mercado Pago", details: data });
    }

    const tx = data.point_of_interaction.transaction_data;

    res.json({
      qr_code_base64: tx.qr_code_base64,
      qr_code: tx.qr_code,
      payment_id: data.id,
    });
  } catch (err) {
    console.error("Erro em /pagar:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ------------------------ CONSULTA STATUS ------------------------
app.get("/status/:payment_id", async (req: Request, res: Response) => {
  const payment_id = req.params.payment_id;
  if (!payment_id) return res.status(400).json({ error: "payment_id requerido" });

  try {
    const mpRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${payment_id}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${MP_TOKEN}` },
      }
    );

    const data: any = await mpRes.json();

    if (!mpRes.ok) {
      return res.status(500).json({ error: "Erro Mercado Pago", details: data });
    }

    res.json({ status: data.status, id: data.id, data });

    // Notifica ESP32 se aprovado
    if (data.status === "approved" && ESP32_NOTIFY_URL) {
      try {
        await fetch(ESP32_NOTIFY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_id: data.id, status: data.status }),
        });
        console.log("Notificado ESP32:", ESP32_NOTIFY_URL);
      } catch (e: any) {
        console.warn("Falha ao notificar ESP32:", e.message);
      }
    }
  } catch (err) {
    console.error("Erro em /status:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ------------------------ ROTA DE PRODUTOS ------------------------
app.get("/produtos", (req: Request, res: Response) => {
  res.json(PRODUCTS);
});

// ------------------------ FRONTEND ------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.join(__dirname, "../");

app.use(express.static(publicPath));

app.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(publicPath, "public_index.html"));
});

// ------------------------ START SERVER ------------------------
app.listen(PORT, () => console.log(`✅ Server rodando na porta ${PORT}`));
