const express = require("express");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const serviceAccount = require("./firebaseKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
const PORT = 3000;

async function gerarPDF(res, nomeArquivo, dados) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let y = 800;
  const margin = 50;

  page.drawText("Relatório de Patrimônios", { x: margin, y, size: 16, font });
  y -= 30;

  for (const centro in dados) {
    page.drawText(`Centro de Custo: ${centro}`, { x: margin, y, size: 13, font });
    y -= 20;

    for (const p of dados[centro]) {
      const blocos = [
        `Placa: ${p.placa || "N/A"}`,
        `Nome: ${p.nome || "N/A"}`,
        `Descrição: ${p.descricao || "N/A"}`,
        `Conservação: ${p.conservacao || "N/A"}`,
        `Valor Atual: R$ ${parseFloat(p.valorAtual || 0).toFixed(2)}`,
        `Valor de Mercado: R$ ${parseFloat(p.valorMercado || 0).toFixed(2)}`,
      ];

      for (const linha of blocos) {
        page.drawText(linha, { x: margin, y, size: 10, font });
        y -= 15;
      }

      const imagens = [p.imgBlob, p.imgBlob_02, p.imgBlob_03].filter(Boolean);
      let imgX = margin;
      let maxHeight = 0;

      for (const base64 of imagens) {
        try {
          const base64Data = base64.split(",")[1];
          const imgBytes = Buffer.from(base64Data, "base64");
          const image = base64.includes("png")
            ? await pdfDoc.embedPng(imgBytes)
            : await pdfDoc.embedJpg(imgBytes);

          const imgDims = image.scale(0.15); // imagem menor

          if (imgX + imgDims.width > 595 - margin) {
            imgX = margin;
            y -= maxHeight + 10;
            maxHeight = 0;
          }

          if (y - imgDims.height < 50) {
            page = pdfDoc.addPage([595, 842]);
            y = 800;
            imgX = margin;
            maxHeight = 0;
          }

          page.drawImage(image, {
            x: imgX,
            y: y - imgDims.height,
            width: imgDims.width,
            height: imgDims.height,
          });

          if (imgDims.height > maxHeight) maxHeight = imgDims.height;
          imgX += imgDims.width + 10;
        } catch (e) {
          console.error("Erro ao processar imagem:", e);
        }
      }

      if (imagens.length > 0) y -= maxHeight + 20;
      else y -= 15;

      if (y < 100) {
        page = pdfDoc.addPage([595, 842]);
        y = 800;
      }
    }

    y -= 20;
  }

  const pdfBytes = await pdfDoc.save();
  const filePath = path.join(__dirname, nomeArquivo);
  fs.writeFileSync(filePath, pdfBytes);
  res.download(filePath);
}

app.get("/relatorio", async (req, res) => {
  try {
    const snapshot = await db.collection("patrimonios").get();
    const patrimonios = snapshot.docs.map((doc) => doc.data());

    const gruposCentroCusto = patrimonios.reduce((acc, p) => {
      const centro = p.centroCusto || "Não Definido";
      if (!acc[centro]) acc[centro] = [];
      acc[centro].push(p);
      return acc;
    }, {});

    await gerarPDF(res, "relatorio.pdf", gruposCentroCusto);
  } catch (error) {
    console.error("Erro ao gerar relatório:", error);
    res.status(500).send("Erro ao gerar relatório");
  }
});

app.get("/relatorioCC/:centroCusto", async (req, res) => {
  try {
    const { centroCusto } = req.params;

    const snapshot = await db
      .collection("patrimonios")
      .where("centroCusto", "==", centroCusto)
      .get();

    const patrimonios = snapshot.docs.map((doc) => doc.data());

    if (patrimonios.length === 0) {
      return res.status(404).send("Nenhum patrimônio encontrado para esse centro de custo.");
    }

    await gerarPDF(res, `relatorio-${centroCusto}.pdf`, {
      [centroCusto]: patrimonios,
    });
  } catch (error) {
    console.error("Erro ao gerar relatório por centro de custo:", error);
    res.status(500).send("Erro ao gerar relatório.");
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
