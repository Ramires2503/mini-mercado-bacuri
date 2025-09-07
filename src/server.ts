import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config();
const app = express();

// Configura CORS só para seu domínio autorizado
app.use(cors({
  origin: ["https://seusite.com"], // troque pelo domínio do seu frontend
}));

app.use(express.json());

const MP_TOKEN = process.env.MP_TOKEN; // Token Mercado Pago no .env
const ESP32_NOTIFY_URL = process.env.ESP32_NOTIFY_URL || ""; // URL do ESP32 opcional
const API_KEY = process.env.API_KEY; // Sua chave secreta para acessar a API

if (!MP_TOKEN) {
  console.error("ERRO: configure MP_TOKEN no .env");
  process.exit(1);
}

if (!API_KEY) {
  console.error("ERRO: configure API_KEY no .env");
  process.exit(1);
}

// Middleware para checar API Key na requisição
app.use((req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(403).json({ error: "Acesso negado: chave inválida" });
  }
  next();
});

// Tipagem dos produtos
interface Produto {
  id: string;
  nome: string;
  preco: number;
  imagem: string;
}

// Carrega produtos de um arquivo JSON local
const PRODUCTS_PATH = path.join(__dirname, "produtos.json");
const rawData = fs.readFileSync(PRODUCTS_PATH, "utf-8");
const PRODUCTS: Record<string, Produto[]> = JSON.parse(rawData);

// --------------------------------------------------
// Rota para criar pagamento PIX via Mercado Pago
// Recebe: { items: [{id, qty}], total, referencia }
// --------------------------------------------------
app.post("/pagar", async (req, res) => {
  try {
    const { items, total: totalEnviado, referencia } = req.body;

    if(!items || !Array.isArray(items) || items.length === 0){
      return res.status(400).json({ error: "Itens inválidos" });
    }

    // Calcula total real baseado nos produtos do servidor
    let totalCalculado = 0;
    for(const item of items){
      let produto: Produto | undefined;
      for(const cat in PRODUCTS){
        produto = PRODUCTS[cat].find(p => p.id === item.id);
        if(produto) break;
      }
      if(!produto){
        return res.status(400).json({ error: Produto ${item.id} não encontrado });
      }
      totalCalculado += produto.preco * (item.qty || 0);
    }

    if(Math.abs(totalCalculado - parseFloat(totalEnviado)) > 0.01){
      return res.status(400).json({ error: "Total não confere com os produtos" });
    }

    // Monta payload Mercado Pago
    const payload = {
      transaction_amount: totalCalculado,
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
// --------------------------------------------------
// Rota para consultar status do pagamento Mercado Pago
// --------------------------------------------------
app.get("/status/:payment_id", async (req, res) => {
  const payment_id = req.params.payment_id;
  if (!payment_id)
    return res.status(400).json({ error: "payment_id requerido" });

  try {
    const mpRes = await fetch(
      https://api.mercadopago.com/v1/payments/${payment_id},
      {
        method: "GET",
        headers: { "Authorization": Bearer ${MP_TOKEN} }
      }
    );

    const data = await mpRes.json();
    if (!mpRes.ok) {
      return res.status(500).json({ error: "Erro Mercado Pago", details: data });
    }

    res.json({ status: data.status, id: data.id, data });

    // Notifica ESP32 se estiver configurado
    if (data.status === "approved" && ESP32_NOTIFY_URL) {
      try {
        await fetch(ESP32_NOTIFY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_id: data.id, status: data.status })
        });
        console.log("Notificado ESP32:", ESP32_NOTIFY_URL);
      } catch (e: any) {
        console.warn("Falha ao notificar ESP32:", e.message);
      }
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// --------------------------------------------------
// Servir a página HTML e arquivos estáticos
// --------------------------------------------------
const publicPath = path.join(__dirname, ".");
app.use(express.static(publicPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "public_index.html"));
});

// --------------------------------------------------
// Inicializa servidor
// --------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(✅ Server rodando em http://localhost:${PORT})
);
