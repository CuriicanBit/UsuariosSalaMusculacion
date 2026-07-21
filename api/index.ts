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

// Helpers for RUT normalization
function cleanRut(rut: string): string {
  return String(rut || "").replace(/[^0-9kK]/g, "").toUpperCase();
}

function normalizeRut(rut: string): string {
  const clean = cleanRut(rut);
  if (clean.length < 2) return clean;
  const dv = clean.slice(-1);
  const num = clean.slice(0, -1);
  
  let formatted = "";
  let i = num.length;
  while (i > 0) {
    formatted = (i - 3 > 0 ? "." : "") + num.slice(Math.max(0, i - 3), i) + formatted;
    i -= 3;
  }
  return `${formatted}-${dv}`;
}

// --- Local Store Persistence Helper ---

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

interface GymUser {
  id: string;
  rut: string;
  fullName: string;
  category: string;
  createdAt: string;
}

interface LocalStore {
  users: GymUser[];
  deletedRuts: string[];
  settings: any;
}

function loadLocalStore(): LocalStore {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const content = fs.readFileSync(STORE_FILE, "utf-8");
      const parsed = JSON.parse(content);
      return {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        deletedRuts: Array.isArray(parsed.deletedRuts) ? parsed.deletedRuts : [],
        settings: parsed.settings || null
      };
    }
  } catch (e: any) {
    console.error("[STORE] Error leyendo store.json:", e.message);
  }
  return { users: [], deletedRuts: [], settings: null };
}

function saveLocalStore(store: LocalStore) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (e: any) {
    console.error("[STORE] Error guardando store.json:", e.message);
  }
}

let localStore: LocalStore = loadLocalStore();

// --- Supabase Data Helpers (with Local Fallback) ---

async function getDbUsers(): Promise<GymUser[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('gym_users').select('*');
      if (!error && Array.isArray(data)) {
        const dbUsers: GymUser[] = data.map(u => ({
          id: u.id,
          rut: u.rut,
          fullName: u.full_name,
          category: u.category,
          createdAt: u.created_at
        }));

        const deletedSet = new Set(localStore.deletedRuts.map(cleanRut));
        const mergedMap = new Map<string, GymUser>();

        for (const u of localStore.users) {
          const cRut = cleanRut(u.rut);
          if (!deletedSet.has(cRut)) {
            mergedMap.set(cRut, u);
          }
        }

        for (const u of dbUsers) {
          const cRut = cleanRut(u.rut);
          if (!deletedSet.has(cRut)) {
            mergedMap.set(cRut, u);
          }
        }

        localStore.users = Array.from(mergedMap.values());
        saveLocalStore(localStore);
        return localStore.users;
      }
    } catch {
      // Supabase unavailable - fallback gracefully to local store
    }
  }

  const deletedSet = new Set(localStore.deletedRuts.map(cleanRut));
  return localStore.users.filter(u => !deletedSet.has(cleanRut(u.rut)));
}

async function saveDbUser(user: any): Promise<GymUser> {
  const normRut = normalizeRut(user.rut);
  const cRut = cleanRut(user.rut);
  const sanitizedUser: GymUser = {
    id: user.id || `local-${Date.now()}`,
    rut: normRut,
    fullName: user.fullName || "Sin Nombre",
    category: user.category || "Funcionario",
    createdAt: user.createdAt || new Date().toISOString()
  };

  // Remove from deletedRuts if re-creating
  localStore.deletedRuts = localStore.deletedRuts.filter(r => cleanRut(r) !== cRut);

  const idx = localStore.users.findIndex(u => u.id === sanitizedUser.id || cleanRut(u.rut) === cRut);
  if (idx >= 0) {
    localStore.users[idx] = sanitizedUser;
  } else {
    localStore.users.unshift(sanitizedUser);
  }
  saveLocalStore(localStore);

  if (supabase) {
    try {
      await supabase.from('gym_users').upsert({
        id: sanitizedUser.id,
        rut: sanitizedUser.rut,
        full_name: sanitizedUser.fullName,
        category: sanitizedUser.category,
        created_at: sanitizedUser.createdAt
      });
    } catch {
      // Supabase update failed - saved locally
    }
  }

  return sanitizedUser;
}

async function saveDbUsersBulk(usersList: any[]) {
  if (!usersList || usersList.length === 0) return;

  const deletedSet = new Set(localStore.deletedRuts.map(cleanRut));
  const validUsers: GymUser[] = [];

  for (const user of usersList) {
    const cRut = cleanRut(user.rut);
    if (deletedSet.has(cRut)) continue;

    const sanitized: GymUser = {
      id: user.id || `excel-${user.rut}`,
      rut: normalizeRut(user.rut),
      fullName: user.fullName || "Sin Nombre",
      category: user.category || "Funcionario",
      createdAt: user.createdAt || new Date().toISOString()
    };
    validUsers.push(sanitized);

    const idx = localStore.users.findIndex(u => u.id === sanitized.id || cleanRut(u.rut) === cRut);
    if (idx >= 0) {
      localStore.users[idx] = sanitized;
    } else {
      localStore.users.push(sanitized);
    }
  }
  saveLocalStore(localStore);

  if (supabase && validUsers.length > 0) {
    try {
      const rows = validUsers.map(u => ({
        id: u.id,
        rut: u.rut,
        full_name: u.fullName,
        category: u.category,
        created_at: u.createdAt
      }));
      await supabase.from('gym_users').upsert(rows);
    } catch {
      // Supabase bulk upsert failed - saved locally
    }
  }
}

async function deleteDbUser(id: string) {
  const targetUser = localStore.users.find(u => u.id === id || cleanRut(u.rut) === cleanRut(id));
  if (targetUser) {
    const cRut = cleanRut(targetUser.rut);
    if (!localStore.deletedRuts.includes(cRut)) {
      localStore.deletedRuts.push(cRut);
    }
    localStore.users = localStore.users.filter(u => u.id !== targetUser.id && cleanRut(u.rut) !== cRut);
    saveLocalStore(localStore);

    if (supabase) {
      try {
        await supabase.from('gym_users').delete().or(`id.eq.${targetUser.id},rut.eq.${targetUser.rut}`);
      } catch {
        // Supabase delete failed - handled locally
      }
    }
  } else {
    const cRut = cleanRut(id);
    if (cRut.length >= 7) {
      if (!localStore.deletedRuts.includes(cRut)) {
        localStore.deletedRuts.push(cRut);
      }
      saveLocalStore(localStore);
    }
    if (supabase) {
      try {
        await supabase.from('gym_users').delete().eq('id', id);
      } catch {
        // Supabase delete failed - handled locally
      }
    }
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

  if (localStore.settings) {
    return {
      ...defaultSettings,
      ...localStore.settings,
      smtpConfig: {
        ...defaultSettings.smtpConfig,
        ...(localStore.settings.smtpConfig || {})
      }
    };
  }

  if (supabase) {
    try {
      const { data, error } = await supabase.from('gym_settings').select('value').eq('key', 'global_config').single();
      if (!error && data?.value) {
        localStore.settings = data.value;
        saveLocalStore(localStore);
        return {
          ...defaultSettings,
          ...data.value,
          smtpConfig: {
            ...defaultSettings.smtpConfig,
            ...(data.value.smtpConfig || {})
          }
        };
      }
    } catch {
      // Supabase settings fetch failed - using local settings
    }
  }

  return defaultSettings;
}

async function saveDbSettings(settings: any) {
  localStore.settings = settings;
  saveLocalStore(localStore);

  if (supabase) {
    try {
      await supabase.from('gym_settings').upsert({
        key: 'global_config',
        value: settings
      });
    } catch {
      // Supabase settings save failed - saved locally
    }
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

    const deletedSet = new Set(localStore.deletedRuts.map(cleanRut));

    const excelUsers = rawData.slice(1).map(row => {
      const rut = normalizeRut(row.A);
      const cRut = cleanRut(row.A);
      const fullName = String(row.B || "").trim();
      const categoryRaw = String(row.C || "").trim();
      if (!rut || !fullName || rut === "RUT" || deletedSet.has(cRut)) return null;
      return {
        id: `excel-${rut}`,
        rut,
        fullName,
        category: categoryRaw.toLowerCase().includes("familiar") ? "Familiar" : "Funcionario",
        createdAt: new Date().toISOString()
      };
    }).filter(Boolean);

    console.log(`[SYNC] Cargados ${excelUsers.length} usuarios desde el Excel.`);

    const existingUsers = await getDbUsers();
    const existingRuts = new Set(existingUsers.map(u => cleanRut(u.rut)));
    
    const newUsersToSave = [];
    for (const exUser of excelUsers) {
      if (exUser && !existingRuts.has(cleanRut(exUser.rut))) {
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
  
  if (normalizedRut && existing.find(u => cleanRut(u.rut) === cleanRut(normalizedRut))) {
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
