import express from "express";
import path from "path";
import axios from "axios";
import * as XLSX from "xlsx";
import cors from "cors";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// Initialize Supabase Client safely
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "";

let supabase: any = null;

if (supabaseUrl && supabaseKey) {
  try {
    // Validate if it is a valid URL format to avoid library crashing the process
    new URL(supabaseUrl);
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch (err: any) {
    console.error("❌ ERROR: El formato de SUPABASE_URL no es válido o falló la inicialización de Supabase:", err.message);
  }
} else {
  console.log("⚠️ SUPABASE CONFIG NOT FOUND OR INCOMPLETE. RUNNING IN FALLBACK MODE.");
}

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Helper for RUT normalization
function normalizeRut(rut: string): string {
  return String(rut || "").trim().toUpperCase();
}

// --- Supabase Data Helpers ---

async function getDbUsers() {
  if (!supabase) {
    console.warn("[SUPABASE] Cliente no inicializado. Verifique variables de entorno.");
    return [];
  }
  try {
    const { data, error } = await supabase.from('gym_users').select('*');
    if (error) {
      console.error("[SUPABASE] Error buscando usuarios:", error.message);
      return [];
    }
    return (data || []).map(u => ({
      id: u.id,
      rut: u.rut,
      fullName: u.full_name,
      category: u.category,
      createdAt: u.created_at
    }));
  } catch (e: any) {
    console.error("[SUPABASE] Excepción buscando usuarios:", e.message);
    return [];
  }
}

async function saveDbUser(user: any) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('gym_users').upsert({
      id: user.id,
      rut: user.rut,
      full_name: user.fullName,
      category: user.category,
      created_at: user.createdAt
    });
    if (error) console.error("[SUPABASE] Error saving user:", error.message);
  } catch (e: any) {
    console.error("[SUPABASE] Excepción guardando usuario:", e.message);
  }
}

async function saveDbUsersBulk(usersList: any[]) {
  if (!supabase || usersList.length === 0) return;
  try {
    const rows = usersList.map(user => ({
      id: user.id,
      rut: user.rut,
      full_name: user.fullName,
      category: user.category,
      created_at: user.createdAt
    }));
    const { error } = await supabase.from('gym_users').upsert(rows);
    if (error) {
      console.error("[SUPABASE] Error in bulk upsert:", error.message);
      throw error;
    }
    console.log(`[SUPABASE] Bulk upsert exitoso de ${rows.length} usuarios.`);
  } catch (e: any) {
    console.error("[SUPABASE] Excepción en bulk upsert:", e.message);
    throw e;
  }
}

async function deleteDbUser(id: string) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('gym_users').delete().eq('id', id);
    if (error) console.error("[SUPABASE] Error deleting user:", error.message);
  } catch (e: any) {
    console.error("[SUPABASE] Excepción eliminando usuario:", e.message);
  }
}

async function getDbSettings() {
  const defaultSettings = {
    excelUrl: "https://aluautonoma365-my.sharepoint.com/:x:/g/personal/talca_gimnasio_reservas_cloud_uautonoma_cl1/IQBAcJZ5RafKQLHVIKpJJKnIAWTGDK9w8yy19ZNIwpHJPkc?e=GGIAO0",
    formUrlTemplate: "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=ucHaYEdgmkihNLBwOGzM98CRIjirj0hFgBahBX98C91UQkZVN0JGRTAzWVhONjNWVzVENDE3UkVSWi4u&r58696eaabd0347c8ba03ecfa4dbd36a0=",
    smtpConfig: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || '465',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      targetEmail: process.env.SMTP_TARGET_EMAIL || ''
    }
  };

  if (!supabase) return defaultSettings;
  
  try {
    const { data, error } = await supabase.from('gym_settings').select('value').eq('key', 'global_config').single();
    if (error || !data) return defaultSettings;
    
    const dbSettings = data.value;
    return {
      ...defaultSettings,
      ...dbSettings,
      smtpConfig: {
        ...defaultSettings.smtpConfig,
        ...(dbSettings.smtpConfig || {})
      }
    };
  } catch (e) {
    console.error("[SUPABASE] Error cargando ajustes:", e);
    return defaultSettings;
  }
}

async function saveDbSettings(settings: any) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('gym_settings').upsert({
      key: 'global_config',
      value: settings
    });
    if (error) console.error("[SUPABASE] Error saving settings:", error.message);
  } catch (e: any) {
    console.error("[SUPABASE] Excepción guardando ajustes:", e.message);
  }
}

// --- Endpoints ---

app.get("/api/settings", async (req, res) => {
  const settings = await getDbSettings();
  res.json(settings);
});

app.post("/api/settings", async (req, res) => {
  const current = await getDbSettings();
  const updated = { ...current, ...req.body };
  await saveDbSettings(updated);
  res.json(updated);
});

app.post("/api/notify", async (req, res) => {
  const { action, user, targetEmail, smtpConfig } = req.body;
  
  console.log(`[NOTIFY] Recibida solicitud para acción: ${action}, RUT: ${user?.rut}`);

  if (!targetEmail) return res.status(400).json({ error: "Email de destino faltante" });
  if (!smtpConfig || !smtpConfig.user || !smtpConfig.pass) return res.status(400).json({ error: "Configuración SMTP incompleta" });

  try {
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host || "smtp.gmail.com",
      port: Number(smtpConfig.port || 465),
      secure: Number(smtpConfig.port) === 465,
      auth: { user: smtpConfig.user, pass: smtpConfig.pass },
      tls: { rejectUnauthorized: false }
    });

    const cleanStr = (s: any) => String(s || "").replace(/[\r\n\t]+/g, " ").trim();

    const sanitizedUser = {
      id: cleanStr(user?.id || `local-${Date.now()}`),
      rut: cleanStr(user?.rut || "N/A"),
      fullName: cleanStr(user?.fullName || "Sin Nombre"),
      category: cleanStr(user?.category || "General"),
      createdAt: cleanStr(user?.createdAt || new Date().toISOString())
    };

    const payload = { action, user: sanitizedUser };
    const jsonStr = JSON.stringify(payload);
    
    console.log(`[SMTP-SEND] Intentando enviar correo para ${action} RUT ${sanitizedUser.rut}...`);

    const mailOptions = {
      from: `"UA Sede Talca" <${smtpConfig.user}>`,
      to: targetEmail,
      subject: `[GYM-UA-ACTION] ${action}: ${sanitizedUser.rut}`,
      text: jsonStr,
      html: `<!--JSON_DATA_START-->${jsonStr}<!--JSON_DATA_END-->
        <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #002c4b; padding: 20px; border-radius: 10px;">
          <div style="background-color: #002c4b; color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px; text-align: center;">
            <h2 style="margin: 0; font-size: 18px;">UA CONTROL GIMNASIO</h2>
          </div>
          <p style="color: #333; font-size: 14px;">Se ha registrado la siguiente operación en el sistema:</p>
          <div style="background-color: #f8fbff; padding: 15px; border-radius: 8px; border-left: 5px solid #002c4b;">
            <p style="margin: 5px 0;"><strong>ACCIÓN:</strong> <span style="color: #d32f2f;">${action === 'CREATE' ? 'CREACIÓN' : action === 'UPDATE' ? 'ACTUALIZACIÓN' : 'ELIMINACIÓN'}</span></p>
            <p style="margin: 5px 0;"><strong>RUT:</strong> ${sanitizedUser.rut}</p>
            <p style="margin: 5px 0;"><strong>NOMBRE:</strong> ${sanitizedUser.fullName}</p>
            <p style="margin: 5px 0;"><strong>CATEGORÍA:</strong> ${sanitizedUser.category}</p>
          </div>
          <p style="font-size: 11px; color: #666; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px;">
            Esta notificación es procesada automáticamente para sincronización con SharePoint Excel. 
            Por favor, no elimine el bloque de datos JSON invisible al inicio de este mensaje.
          </p>
        </div>`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[SMTP-SUCCESS] Correo enviado exitosamente: MessageId: ${info.messageId} | RUT: ${sanitizedUser.rut}`);
    res.json({ success: true, messageId: info.messageId });
  } catch (error: any) {
    console.error("[SMTP-ERROR] Falló el envío:", error.message);
    res.status(500).json({ error: "Fallo envío correo", details: error.message });
  }
});

app.post("/api/sync-excel", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  try {
    let downloadUrl = url;
    try {
      if (url.includes("/:x:/g/")) {
        const parts = url.split("/:x:/g/");
        const baseUrl = parts[0];
        const remaining = parts[1];
        const pathParts = remaining.split("/");
        const id = (pathParts.pop() || "").split("?")[0];
        downloadUrl = `${baseUrl}/${pathParts.join("/")}/_layouts/15/download.aspx?share=${id}`;
      }
    } catch (e) {}

    console.log(`[SYNC] Iniciando descarga desde SharePoint...`);
    const response = await axios.get(downloadUrl, { 
      responseType: "arraybuffer",
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const buffer = Buffer.from(response.data);
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData: any[] = XLSX.utils.sheet_to_json(sheet, { header: "A" });

    const excelUsers = rawData.slice(1).map(row => {
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

    console.log(`[SYNC] Cargados ${excelUsers.length} usuarios desde el Excel.`);

    // We bring ALL users from Supabase to filter out existing ones
    const existingUsers = await getDbUsers();
    const existingRuts = new Set(existingUsers.map(u => normalizeRut(u.rut)));
    
    const newUsersToSave = [];
    for (const exUser of excelUsers) {
      if (exUser && !existingRuts.has(exUser.rut)) {
        newUsersToSave.push(exUser);
      }
    }

    console.log(`[SYNC] ${newUsersToSave.length} usuarios nuevos para guardar en base de datos.`);

    if (newUsersToSave.length > 0) {
      // Bulk insert everything in a single, fast SQL call
      await saveDbUsersBulk(newUsersToSave);
    }

    const finalUsers = await getDbUsers();
    console.log(`[SYNC-DONE] Sincronización exitosa. Nuevos: ${newUsersToSave.length}. Total DB: ${finalUsers.length}`);
    res.json({ users: finalUsers });
  } catch (error: any) {
    console.error("[SYNC-ERROR]", error.message);
    res.status(500).json({ error: "Error en sincronización", details: error.message });
  }
});

app.get("/api/users", async (req, res) => {
  const users = await getDbUsers();
  res.json({ users });
});

app.post("/api/users", async (req, res) => {
  const normalizedRut = normalizeRut(req.body.rut);
  const existing = await getDbUsers();
  
  if (normalizedRut && existing.find(u => normalizeRut(u.rut) === normalizedRut)) {
    return res.status(400).json({ error: "RUT Duplicado", details: `El RUT ${normalizedRut} ya existe.` });
  }

  const newUser = {
    ...req.body,
    rut: normalizedRut,
    id: `local-${Date.now()}`,
    createdAt: new Date().toISOString()
  };

  await saveDbUser(newUser);
  res.status(201).json(newUser);
});

app.put("/api/users/:id", async (req, res) => {
  const { id } = req.params;
  const existing = await getDbUsers();
  const user = existing.find(u => u.id === id);
  if (user) {
    const updated = { ...user, ...req.body };
    await saveDbUser(updated);
    res.json(updated);
  } else {
    res.status(404).json({ error: "User not found" });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  const { id } = req.params;
  await deleteDbUser(id);
  res.status(204).send();
});

app.get("/api/download-excel", async (req, res) => {
  try {
    const users = await getDbUsers();
    const exportData = users.map(u => [u.rut, u.fullName, u.category]);
    const ws = XLSX.utils.aoa_to_sheet([["RUT", "Nombre Completo", "Categoría"], ...exportData]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Usuarios");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", "attachment; filename=Usuarios_Gimnasio.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (e: any) {
    res.status(500).json({ error: "Error al generar Excel", details: e.message });
  }
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  try {
    const viteKey = "v" + "i" + "t" + "e";
    // @ts-ignore
    import(viteKey).then(({ createServer: createViteServer }) => {
      createViteServer({ server: { middlewareMode: true }, appType: "spa" }).then(vite => {
        app.use(vite.middlewares);
      }).catch(e => console.warn("No se pudo iniciar Vite middleware:", e));
    });
  } catch (e) {
    console.warn("No se pudo cargar Vite middleware:", e);
  }
} else {
  // Serve static files in production as fallback
  const distPath = path.join(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
  }
}

// In standard local or container runtime, bind to port
if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] Ready on port ${PORT}`);
  });
}

export default app;
