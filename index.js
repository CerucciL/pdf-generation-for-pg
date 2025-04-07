// index.js

const express = require("express");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const serviceAccount = require("./serviceAccount.json");


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
const PORT = 3000;

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
  
      let totalGeralAtual = 0;
      let totalGeralMercado = 0;
  
      let htmlContent = `
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1, h2 { text-align: center; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background-color: #f59e0b; color: black; }
            .image-container { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; justify-content: center; }
            .image { width: 150px; height: 150px; object-fit: cover; border: 1px solid #ccc; }
          </style>
        </head>
        <body>
          <h1>Relatório Geral de Ativos</h1>
      `;
  
      for (const centro in gruposCentroCusto) {
        let subtotalAtual = 0;
        let subtotalMercado = 0;
  
        htmlContent += `<h2>Centro de Custo: ${centro}</h2>`;
        htmlContent += `
          <table>
            <tr>
              <th>Placa</th>
              <th>Nome</th>
              <th>Descrição</th>
              <th>Conservação</th>
              <th>Valor Atual</th>
              <th>Valor de Mercado</th>
            </tr>
        `;
  
        gruposCentroCusto[centro].forEach((p) => {
          const valorAtual = parseFloat(p.valorAtual || "0");
          const valorMercado = parseFloat(p.valorMercado || "0");
  
          subtotalAtual += valorAtual;
          subtotalMercado += valorMercado;
  
          htmlContent += `
            <tr>
              <td>${p.placa || "N/A"}</td>
              <td>${p.nome || "N/A"}</td>
              <td>${p.descricao || "N/A"}</td>
              <td>${p.conservacao || "N/A"}</td>
              <td>R$ ${valorAtual.toFixed(2)}</td>
              <td>R$ ${valorMercado.toFixed(2)}</td>
            </tr>
          `;
  
          const images = [p.imgBlob, p.imgBlob_02, p.imgBlob_03].filter(Boolean);
          if (images.length > 0) {
            htmlContent += `<tr><td colspan="6"><div class="image-container">`;
            images.forEach((img) => {
              const src = img.startsWith("data:image") ? img : `data:image/jpeg;base64,${img}`;
              htmlContent += `<img src="${src}" class="image" />`;
            });
            htmlContent += `</div></td></tr>`;
          }
        });
  
        // Subtotal por centro
        htmlContent += `
          <tr>
            <td colspan="4" style="text-align:right"><strong>Total do Centro:</strong></td>
            <td><strong>R$ ${subtotalAtual.toFixed(2)}</strong></td>
            <td><strong>R$ ${subtotalMercado.toFixed(2)}</strong></td>
          </tr>
        `;
  
        htmlContent += `</table>`;
  
        totalGeralAtual += subtotalAtual;
        totalGeralMercado += subtotalMercado;
      }
  
      // Total geral
      htmlContent += `
        <h2>Totais Gerais</h2>
        <table>
          <tr>
            <th>Total Geral Valor Atual</th>
            <th>Total Geral Valor de Mercado</th>
          </tr>
          <tr>
            <td><strong>R$ ${totalGeralAtual.toFixed(2)}</strong></td>
            <td><strong>R$ ${totalGeralMercado.toFixed(2)}</strong></td>
          </tr>
        </table>
      `;
  
      htmlContent += `</body></html>`;
  
      const browser = await chromium.launch({ args: ['--no-sandbox'], headless: true });
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'load' });
  
      const pdfPath = path.join(__dirname, "relatorio.pdf");
      await page.pdf({ path: pdfPath, format: "A4" });
      await browser.close();
  
      res.download(pdfPath, "relatorio.pdf");
    } catch (error) {
      console.error("Erro ao gerar relatório:", error);
      res.status(500).send("Erro ao gerar relatório");
    }
  });

  app.get("/relatorioCC/:centroCusto", async (req, res) => {
    try {
      const { centroCusto } = req.params;
  
      const snapshot = await db.collection("patrimonios")
        .where("centroCusto", "==", centroCusto)
        .get();
  
      const patrimonios = snapshot.docs.map((doc) => doc.data());
  
      if (patrimonios.length === 0) {
        return res.status(404).send("Nenhum patrimônio encontrado para esse centro de custo.");
      }
  
      let subtotalAtual = 0;
      let subtotalMercado = 0;
  
      let htmlContent = `
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1, h2 { text-align: center; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background-color: #f59e0b; color: black; }
            .image-container { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; justify-content: center; }
            .image { width: 150px; height: 150px; object-fit: cover; border: 1px solid #ccc; }
          </style>
        </head>
        <body>
          <h1>Relatório de Ativos - ${centroCusto}</h1>
          <table>
            <tr>
              <th>Placa</th>
              <th>Nome</th>
              <th>Descrição</th>
              <th>Conservação</th>
              <th>Valor Atual</th>
              <th>Valor de Mercado</th>
            </tr>
      `;
  
      patrimonios.forEach((p) => {
        const valorAtual = parseFloat(p.valorAtual || "0");
        const valorMercado = parseFloat(p.valorMercado || "0");
  
        subtotalAtual += valorAtual;
        subtotalMercado += valorMercado;
  
        htmlContent += `
          <tr>
            <td>${p.placa || "N/A"}</td>
            <td>${p.nome || "N/A"}</td>
            <td>${p.descricao || "N/A"}</td>
            <td>${p.conservacao || "N/A"}</td>
            <td>R$ ${valorAtual.toFixed(2)}</td>
            <td>R$ ${valorMercado.toFixed(2)}</td>
          </tr>
        `;
  
        const images = [p.imgBlob, p.imgBlob_02, p.imgBlob_03].filter(Boolean);
        if (images.length > 0) {
          htmlContent += `<tr><td colspan="6"><div class="image-container">`;
          images.forEach((img) => {
            const src = img.startsWith("data:image") ? img : `data:image/jpeg;base64,${img}`;
            htmlContent += `<img src="${src}" class="image" />`;
          });
          htmlContent += `</div></td></tr>`;
        }
      });
  
      // Linha de totais
      htmlContent += `
        <tr>
          <td colspan="4" style="text-align: right;"><strong>Total do Centro:</strong></td>
          <td><strong>R$ ${subtotalAtual.toFixed(2)}</strong></td>
          <td><strong>R$ ${subtotalMercado.toFixed(2)}</strong></td>
        </tr>
      `;
  
      htmlContent += `</table></body></html>`;
  
      const browser = await chromium.launch({ args: ['--no-sandbox'], headless: true });
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'load' });
  
      const pdfPath = path.join(__dirname, `relatorio-${centroCusto}.pdf`);
      await page.pdf({ path: pdfPath, format: "A4" });
      await browser.close();
  
      res.download(pdfPath, `relatorio-${centroCusto}.pdf`);
    } catch (error) {
      console.error("Erro ao gerar relatório por centro de custo:", error);
      res.status(500).send("Erro ao gerar relatório.");
    }
  });
  

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
