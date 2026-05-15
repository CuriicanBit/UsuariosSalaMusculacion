import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import * as XLSX from "xlsx";
import cors from "cors";
import fs from "fs";

import nodemailer from "nodemailer";

// Simple persistent storage files
const DB_PATH = path.join(process.cwd(), "users_db.json");
const SETTINGS_PATH = path.join(process.cwd(), "settings_db.json");
const DELETED_RUTS_PATH = path.join(process.cwd(), "deleted_ruts.json");

function loadDeletedRuts(): string[] {
  if (fs.existsSync(DELETED_RUTS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(DELETED_RUTS_PATH, "utf8"));
    } catch (e) {
      return [];
    }
  }
  return [];
}

function saveDeletedRuts(ruts: string[]) {
  fs.writeFileSync(DELETED_RUTS_PATH, JSON.stringify(ruts, null, 2));
}

function loadLocalUsers() {
  if (fs.existsSync(DB_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    } catch (e) {
      return [];
    }
  }
  return [];
}

function saveLocalUsers(users: any[]) {
  fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
}

function loadSettings() {
  const defaultSettings = {
    excelUrl: "https://aluautonoma365-my.sharepoint.com/:x:/g/personal/talca_gimnasio_reservas_cloud_uautonoma_cl1/IQBAcJZ5RafKQLHVIKpJJKnIAWTGDK9w8yy19ZNIwpHJPkc?e=GGIAO0",
    formUrlTemplate: "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=ucHaYEdgmkihNLBwOGzM98CRIjirj0hFgBahBX98C91UQkZVN0JGRTAzWVhONjNWVzVENDE3UkVSWi4u&r58696eaabd0347c8ba03ecfa4dbd36a0=",
    linkCreatedDate: new Date().toISOString(),
    smtpConfig: {
      host: 'smtp.gmail.com',
      port: '587',
      user: 'uatalca.desarrollo.tic@gmail.com',
      pass: 'pukw fcqf bjxo wpuj',
      targetEmail: 'talca.gimnasio.reservas@cloud.uautonoma.cl'
    }
  };

  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      return { ...defaultSettings, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")) };
    } catch (e) {
      return defaultSettings;
    }
  }
  return defaultSettings;
}

function saveSettings(settings: any) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  function normalizeRut(rut: string): string {
    return String(rut || "").trim().toUpperCase();
  }

  function deduplicateUsers(users: any[]) {
    const seenRuts = new Set();
    return users.filter(user => {
      const rut = normalizeRut(user.rut);
      if (!rut) return true; // Keep entries without RUT just in case, though they shouldn't exist
      if (seenRuts.has(rut)) return false;
      seenRuts.add(rut);
      return true;
    });
  }

  let managedUsers: any[] = deduplicateUsers(loadLocalUsers());
  let globalSettings = loadSettings();
  let deletedRuts: string[] = loadDeletedRuts();

  // Save cleaned database if it was changed
  saveLocalUsers(managedUsers);

  // Settings Endpoints
  app.get("/api/settings", (req, res) => {
    res.json(globalSettings);
  });

  app.post("/api/settings", (req, res) => {
    globalSettings = { ...globalSettings, ...req.body };
    saveSettings(globalSettings);
    res.json(globalSettings);
  });

  // Notification Endpoint for Power Automate
  app.post("/api/notify", async (req, res) => {
    const { action, user, targetEmail, smtpConfig } = req.body;
    
    console.log(`[NOTIFY] Recibida solicitud para acción: ${action}, RUT: ${user?.rut}`);

    if (!targetEmail) {
      console.warn("[NOTIFY] Error: Email de destino faltante en la petición.");
      return res.status(400).json({ error: "Email de destino faltante" });
    }
    if (!smtpConfig || !smtpConfig.user || !smtpConfig.pass) {
       console.warn("[NOTIFY] Error: Configuración SMTP incompleta en la petición.");
       return res.status(400).json({ error: "Configuración SMTP incompleta" });
    }

    try {
      console.log(`[NOTIFY] Preparando envío a: ${targetEmail} vía ${smtpConfig.host}:${smtpConfig.port}`);
      
      const transporter = nodemailer.createTransport({
        host: smtpConfig.host || "smtp.gmail.com",
        port: Number(smtpConfig.port || 587),
        secure: Number(smtpConfig.port) === 465,
        auth: {
          user: smtpConfig.user,
          pass: smtpConfig.pass,
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      // Aseguramos que la conexión esté bien antes de proceder
      try {
        await transporter.verify();
        console.log("[NOTIFY] Conexión SMTP verificada correctamente.");
      } catch (verifyError: any) {
        console.error("[NOTIFY] Error al verificar conexión SMTP:", verifyError.message);
        throw new Error(`Fallo de conexión SMTP: ${verifyError.message}`);
      }

      // Sanitize fields: Remove ALL newlines to avoid Excel cell breaking
      const cleanStr = (s: any) => String(s || "").replace(/[\r\n]+/g, " ").trim();

      const sanitizedUser = {
        id: cleanStr(user?.id || `local-${Date.now()}`),
        rut: cleanStr(user?.rut || "N/A"),
        fullName: cleanStr(user?.fullName || "Sin Nombre"),
        category: cleanStr(user?.category || "General"),
        createdAt: cleanStr(user?.createdAt || new Date().toISOString())
      };

      const payload = { action, user: sanitizedUser };
      const jsonStr = JSON.stringify(payload);
      
      console.log(`[NOTIFY] ENVIANDO PAYLOAD (${action}):`, jsonStr);

      const mailOptions = {
        from: `"UA Sede Talca" <${smtpConfig.user}>`,
        to: targetEmail,
        subject: `[GYM-UA-ACTION] ${action}: ${sanitizedUser.rut}`,
        text: jsonStr,
        html: `<!--JSON_DATA_START-->${jsonStr}<!--JSON_DATA_END--><div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
            <div style="background-color: #002c4b; color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
              <h2 style="margin: 0; font-size: 18px;">UA Control: Notificación</h2>
            </div>
            <p>Se ha detectado una acción de <strong>${action === 'CREATE' ? 'CREACIÓN' : action === 'UPDATE' ? 'ACTUALIZACIÓN' : 'ELIMINACIÓN'}</strong> de usuario.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 10px; border-bottom: 1px solid #eee; width: 40%;"><strong>RUT:</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">${sanitizedUser.rut}</td></tr>
              <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Nombre:</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">${sanitizedUser.fullName}</td></tr>
              <tr><td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>Categoría:</strong></td><td style="padding: 10px; border-bottom: 1px solid #eee;">${sanitizedUser.category}</td></tr>
            </table>
            <div style="margin-top: 30px; padding: 10px; background: #f9f9f9; font-size: 10px; color: #999; border-radius: 5px;">
              <p>ID de Sistema: ${sanitizedUser.id}</p>
              <p>Sincronización por Pasarela SMTP (Power Automate)</p>
            </div>
          </div>`,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`[NOTIFY] EXITOSO: MessageId ${info.messageId} para RUT ${sanitizedUser.rut}`);
      res.json({ success: true, messageId: info.messageId });
    } catch (error: any) {
      console.error("[NOTIFY] Error crítico al enviar notificación:", error.message);
      res.status(500).json({ 
        error: "Fallo en el envío de correo", 
        details: error.message,
        code: error.code
      });
    }
  });

  // API Proxy to fetch Excel data from SharePoint
  app.post("/api/sync-excel", async (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      let downloadUrl = url;
      
      try {
        const urlObj = new URL(url);
        if (url.includes("/:x:/g/")) {
          const parts = url.split("/:x:/g/");
          const baseUrl = parts[0];
          const remaining = parts[1];
          const pathParts = remaining.split("/");
          const idWithParams = pathParts.pop() || "";
          const id = idWithParams.split("?")[0];
          const userPath = pathParts.join("/");
          downloadUrl = `${baseUrl}/${userPath}/_layouts/15/download.aspx?share=${id}`;
        } else if (!urlObj.searchParams.has("download")) {
          urlObj.searchParams.set("download", "1");
          downloadUrl = urlObj.toString();
        }
      } catch (e) {
        return res.status(400).json({ error: "La URL proporcionada no es válida." });
      }

      console.log(`Syncing from SharePoint: ${downloadUrl}`);

      const response = await axios.get(downloadUrl, {
        responseType: "arraybuffer",
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream, */*"
        },
        maxRedirects: 10
      });

      console.log(`Response Status: ${response.status}`);
      console.log(`Content-Type: ${response.headers["content-type"]}`);

      const buffer = Buffer.from(response.data);
      
      // Safety check for HTML (SharePoint login/error pages)
      const contentStr = buffer.toString("utf8", 0, 100);
      if (contentStr.includes("<!DOCTYPE") || contentStr.includes("<html") || String(response.headers["content-type"] || "").includes("text/html")) {
        console.error("Received HTML instead of Excel data.");
        return res.status(403).json({ 
          error: "Vínculo de SharePoint Restringido",
          details: "El enlace devolvió una página de acceso (HTML) en lugar del archivo Excel. Por favor, asegúrese de que el enlace esté configurado con 'Cualquier persona con el vínculo puede editar' y no esté caducado."
        });
      }

      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data: any[] = XLSX.utils.sheet_to_json(sheet, { header: "A" });

      const excelUsers = data.slice(1).map((row, index) => {
        const rut = normalizeRut(row.A);
        const fullName = String(row.B || "").trim();
        const categoryRaw = String(row.C || "").trim();
        if (!rut || !fullName || rut === "RUT") return null;

        return {
          id: `excel-${rut}`,
          rut,
          fullName,
          category: categoryRaw.toLowerCase().includes("familiar") ? "Familiar" : "Funcionario",
          createdAt: new Date().toISOString()
        };
      }).filter(Boolean);

      // Merge Excel users with local users (Local ones take precedence)
      // Note: We ignore deletedRuts here to ensure consistency with master Excel
      const seenRuts = new Set(managedUsers.map(u => normalizeRut(u.rut)));
      const filteredExcelUsers: any[] = [];
      
      excelUsers.forEach((exUser: any) => {
        const rut = normalizeRut(exUser.rut);
        // Removed check for deletedRuts.includes(rut)
        
        if (!seenRuts.has(rut)) {
          filteredExcelUsers.push(exUser);
          seenRuts.add(rut);
        }
      });

      managedUsers = [...managedUsers, ...filteredExcelUsers];
      saveLocalUsers(managedUsers);
      console.log(`Merged ${excelUsers.length} users from Excel. Total: ${managedUsers.length}`);

      res.json({ users: managedUsers });
    } catch (error: any) {
      console.error("Sync error:", error.message);
      res.status(500).json({ error: "Error técnico al sincronizar", details: error.message });
    }
  });

  // CRUD Endpoints
  app.get("/api/users", (req, res) => {
    res.json({ users: managedUsers });
  });

  app.post("/api/users", (req, res) => {
    const { rut: rawRut } = req.body;
    const rut = normalizeRut(rawRut);
    
    // Check for duplicate RUT
    if (rut && managedUsers.find(u => normalizeRut(u.rut) === rut)) {
      return res.status(400).json({ 
        error: "RUT Duplicado", 
        details: `El RUT ${rut} ya se encuentra registrado en el sistema.` 
      });
    }

    const newUser = {
      ...req.body,
      rut, // Use normalized RUT
      id: `local-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    
    // If we re-add a previously deleted user, remove from blacklist
    if (newUser.rut) {
      deletedRuts = deletedRuts.filter(r => r !== newUser.rut);
      saveDeletedRuts(deletedRuts);
    }

    managedUsers = [newUser, ...managedUsers];
    saveLocalUsers(managedUsers);
    res.status(201).json(newUser);
  });

  app.put("/api/users/:id", (req, res) => {
    const { id } = req.params;
    managedUsers = managedUsers.map(u => u.id === id ? { ...u, ...req.body } : u);
    saveLocalUsers(managedUsers);
    res.json(managedUsers.find(u => u.id === id));
  });

  app.delete("/api/users/:id", (req, res) => {
    const { id } = req.params;
    const userToDelete = managedUsers.find(u => u.id === id);
    
    if (userToDelete && userToDelete.rut) {
      if (!deletedRuts.includes(userToDelete.rut)) {
        deletedRuts.push(userToDelete.rut);
        saveDeletedRuts(deletedRuts);
      }
    }

    managedUsers = managedUsers.filter(u => u.id !== id);
    saveLocalUsers(managedUsers);
    res.status(204).send();
  });

  // Download Modified Excel
  app.get("/api/download-excel", (req, res) => {
    try {
      const exportData = managedUsers.map(u => [u.rut, u.fullName, u.category]);
      const ws = XLSX.utils.aoa_to_sheet([["RUT", "Nombre Completo", "Categoría"], ...exportData]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Usuarios");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Disposition", "attachment; filename=Usuarios_Actualizados.xlsx");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (e: any) {
      res.status(500).json({ error: "Error al generar Excel", details: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
