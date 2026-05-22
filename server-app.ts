import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, orderBy, limit } from "firebase/firestore";

dotenv.config();

// Sạch hóa và chuẩn hóa các giá trị Environment Variables (loại bỏ khoảng trắng dư thừa, dấu ngoặc kép/ngoặc đơn bị dán thừa)
function cleanEnv(val: any): string | undefined {
  if (typeof val !== "string") return undefined;
  let clean = val.trim();
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.substring(1, clean.length - 1).trim();
  }
  return clean || undefined;
}

const startupLogs: string[] = [];
startupLogs.push("Server module loaded. Node version: " + process.version);
startupLogs.push("Dotenv configuration loaded.");

const app = express();

app.use(express.json());

// Global CORS & parsing sanity helper
app.use((req, res, next) => {
  if (typeof req.body === "string" && req.body.trim()) {
    try {
      req.body = JSON.parse(req.body);
    } catch (e) {
      // ignore parsing if not valid JSON string
    }
  }
  next();
});

// Initialize Gemini SDK with sanitized API key
let ai: GoogleGenAI | null = null;
const GEMINI_API_KEY = cleanEnv(process.env.GEMINI_API_KEY);
if (GEMINI_API_KEY) {
  try {
    startupLogs.push("Gemini API Key detected. Initializing @google/genai...");
    ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    startupLogs.push("Gemini SDK initialized successfully.");
  } catch (gemInitErr: any) {
    startupLogs.push("Error initializing Gemini SDK: " + gemInitErr.message);
  }
} else {
  startupLogs.push("No GEMINI_API_KEY environment variable found.");
}

// Support Vercel Serverless ephemeral writing in /tmp, fallback to cwd for local development
const isVercel = process.env.VERCEL === "1" || !!process.env.NOW_BUILD;

interface TranslationCache {
  [key: string]: string; // key matches "sourceLang->targetLang:query"
}

let translationCache: TranslationCache = {};

function loadTranslationCache(): TranslationCache {
  const localPath = path.join(process.cwd(), "translation_cache.json");
  const tempPath = path.join("/tmp", "translation_cache.json");

  try {
    if (fs.existsSync(tempPath)) {
      const data = fs.readFileSync(tempPath, "utf-8");
      return JSON.parse(data);
    }
    if (fs.existsSync(localPath)) {
      const data = fs.readFileSync(localPath, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading translation cache file:", error);
  }
  return {};
}

function saveTranslationCache(cache: TranslationCache) {
  const tempPath = path.join("/tmp", "translation_cache.json");
  const localPath = path.join(process.cwd(), "translation_cache.json");

  try {
    fs.writeFileSync(tempPath, JSON.stringify(cache, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing translation cache to /tmp:", error);
  }

  try {
    if (!isVercel) {
      fs.writeFileSync(localPath, JSON.stringify(cache, null, 2), "utf-8");
    }
  } catch (error) {
    // Ignore read-only filesystem errors in Vercel production
  }
}

// Load cache from disk
translationCache = loadTranslationCache();

interface Message {
  id: string;
  sender: string;
  timestamp: string;
  text: string;
  translation?: string;
  langPair?: string;
}

interface ChatStore {
  passcode: string;
  messages: Message[];
}

function loadDB(): ChatStore {
  const localPath = path.join(process.cwd(), "chat_storage.json");
  const tempPath = path.join("/tmp", "chat_storage.json");

  try {
    if (fs.existsSync(tempPath)) {
      const data = fs.readFileSync(tempPath, "utf-8");
      return JSON.parse(data);
    }
    if (fs.existsSync(localPath)) {
      const data = fs.readFileSync(localPath, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading database file:", error);
  }
  return {
    passcode: "310123",
    messages: [],
  };
}

function saveDB(store: ChatStore) {
  const tempPath = path.join("/tmp", "chat_storage.json");
  const localPath = path.join(process.cwd(), "chat_storage.json");

  try {
    fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing database file to /tmp:", error);
  }

  try {
    if (!isVercel) {
      fs.writeFileSync(localPath, JSON.stringify(store, null, 2), "utf-8");
    }
  } catch (error) {
    // Ignore read-only filesystem errors in Vercel production
  }
}

// In-Memory fallback cache in case write fails
let db: ChatStore = loadDB();

// Initialize Firebase dynamically if keys are present
let firebaseAppConfig: any = null;

const FIREBASE_PROJECT_ID = cleanEnv(process.env.FIREBASE_PROJECT_ID);

if (FIREBASE_PROJECT_ID) {
  startupLogs.push("Loading Firebase config from process.env (FIREBASE_PROJECT_ID: " + FIREBASE_PROJECT_ID + ")");
  firebaseAppConfig = {
    apiKey: cleanEnv(process.env.FIREBASE_API_KEY),
    authDomain: cleanEnv(process.env.FIREBASE_AUTH_DOMAIN),
    projectId: FIREBASE_PROJECT_ID,
    storageBucket: cleanEnv(process.env.FIREBASE_STORAGE_BUCKET),
    messagingSenderId: cleanEnv(process.env.FIREBASE_MESSAGING_SENDER_ID),
    appId: cleanEnv(process.env.FIREBASE_APP_ID),
    measurementId: cleanEnv(process.env.FIREBASE_MEASUREMENT_ID),
    databaseId: cleanEnv(process.env.FIREBASE_DATABASE_ID) || "(default)"
  };
} else {
  startupLogs.push("No FIREBASE_PROJECT_ID env var detected. Checking firebase-applet-config.json...");
  try {
    let dirname = "";
    try {
      dirname = __dirname;
    } catch (_) {}

    const pathsToSearch = [
      path.join(process.cwd(), "firebase-applet-config.json"),
      path.join(process.cwd(), "..", "firebase-applet-config.json")
    ];
    if (dirname) {
      pathsToSearch.push(path.join(dirname, "firebase-applet-config.json"));
      pathsToSearch.push(path.join(dirname, "..", "firebase-applet-config.json"));
      pathsToSearch.push(path.join(dirname, "../..", "firebase-applet-config.json"));
    }

    let resolvedConfigPath = "";
    for (const p of pathsToSearch) {
      if (fs.existsSync(p)) {
        resolvedConfigPath = p;
        break;
      }
    }

    if (resolvedConfigPath) {
      startupLogs.push("Found firebase-applet-config.json at " + resolvedConfigPath);
      const configData = JSON.parse(fs.readFileSync(resolvedConfigPath, "utf-8"));
      firebaseAppConfig = {
        apiKey: cleanEnv(configData.apiKey),
        authDomain: cleanEnv(configData.authDomain),
        projectId: cleanEnv(configData.projectId),
        storageBucket: cleanEnv(configData.storageBucket),
        messagingSenderId: cleanEnv(configData.messagingSenderId),
        appId: cleanEnv(configData.appId),
        measurementId: cleanEnv(configData.measurementId),
        databaseId: cleanEnv(configData.firestoreDatabaseId) || "(default)"
      };
    } else {
      startupLogs.push("firebase-applet-config.json was not found in any search paths.");
    }
  } catch (err: any) {
    startupLogs.push("Could not load firebase config JSON file path: " + err.message);
    console.error("Could not load firebase config JSON file path:", err);
  }

  // Fallback to user's explicit provided Firebase coordinates
  if (!firebaseAppConfig) {
    startupLogs.push("Falling back to embedded static Firebase database configuration.");
    firebaseAppConfig = {
      apiKey: "AIzaSyCo_qwv4j9k6zMmX3m-jEgGUCswf2Gn0IE",
      authDomain: "translate-9424b.firebaseapp.com",
      projectId: "translate-9424b",
      storageBucket: "translate-9424b.firebasestorage.app",
      messagingSenderId: "1027753787412",
      appId: "1:1027753787412:web:018ecddec74af569692701",
      measurementId: "G-5H3NC42T6M",
      databaseId: "(default)"
    };
  }
}

let dbInstance: any = null;
if (firebaseAppConfig && firebaseAppConfig.projectId) {
  startupLogs.push("Attempting to initialize Firebase app with project ID: " + firebaseAppConfig.projectId);
  try {
    const fApp = getApps().length === 0 ? initializeApp(firebaseAppConfig) : getApp();
    startupLogs.push("Firebase App initialized successfully.");
    try {
      // Force HTTP Long Polling for stability
      startupLogs.push("Initializing Firestore with force long polling (databaseId: " + firebaseAppConfig.databaseId + ")...");
      dbInstance = initializeFirestore(fApp, {
        experimentalForceLongPolling: true
      }, firebaseAppConfig.databaseId);
      startupLogs.push("Firebase Firestore active & connected for chat backend (using Client SDK with Long Polling)!");
      console.log("Firebase Firestore active & connected for chat backend (using Client SDK with Long Polling)!");
    } catch (fsErr: any) {
      startupLogs.push("Could not initialize Firestore with experimentalForceLongPolling, falling back to basic: " + fsErr.message);
      console.warn("Could not initialize Firestore with experimentalForceLongPolling, falling back to basic:", fsErr.message || fsErr);
      try {
        dbInstance = initializeFirestore(fApp, {}, firebaseAppConfig.databaseId);
        startupLogs.push("Firebase Firestore active with standard configuration.");
        console.log("Firebase Firestore active with standard configuration.");
      } catch (innerErr: any) {
        startupLogs.push("Critical: Failed to initialize standard Firestore: " + innerErr.message);
        console.error("Critical: Failed to initialize standard Firestore:", innerErr.message || innerErr);
      }
    }
  } catch (err: any) {
    startupLogs.push("Failed to initialize Firebase app: " + err.message);
    console.error("Failed to initialize Firebase app:", err.message || err);
  }
} else {
  startupLogs.push("No Firebase config structure available to initialize.");
}

// Passcode Getter helper
// --- FIRESTORE DIAGNOSTICS & ERROR HANDLING ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errStr = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errStr,
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function getPasscode(): Promise<string> {
  if (dbInstance) {
    const pathRef = "chat_settings/global";
    try {
      const docRef = doc(dbInstance, "chat_settings", "global");
      let docSnap;
      try {
        docSnap = await getDoc(docRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, pathRef);
      }

      if (docSnap.exists()) {
        const pc = docSnap.data().passcode;
        if (pc) {
          db.passcode = pc;
          saveDB(db);
          return pc;
        }
      } else {
        try {
          await setDoc(docRef, { passcode: db.passcode });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, pathRef);
        }
      }
    } catch (err: any) {
      console.error("Error reading passcode from Firestore (falling back to local memory):", err.message || err);
    }
  }
  return db.passcode;
}

// Passcode Setter helper
async function setPasscode(newPasscode: string): Promise<boolean> {
  let savedToFirestore = false;
  if (dbInstance) {
    const pathRef = "chat_settings/global";
    try {
      const docRef = doc(dbInstance, "chat_settings", "global");
      try {
        await setDoc(docRef, { passcode: newPasscode });
        savedToFirestore = true;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, pathRef);
      }
    } catch (err: any) {
      console.error("Error writing passcode to Firestore (falling back to local memory):", err.message || err);
    }
  }
  db.passcode = newPasscode;
  saveDB(db);
  return true;
}

// Get Chats Helper
async function getChatsFromDB(): Promise<Message[]> {
  if (dbInstance) {
    const pathRef = "messages";
    try {
      const msgsRef = collection(dbInstance, "messages");
      const q = query(msgsRef, orderBy("timestamp", "asc"), limit(150));
      let querySnapshot;
      try {
        querySnapshot = await getDocs(q);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, pathRef);
      }

      const results: Message[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.id) {
          results.push(data as Message);
        }
      });
      
      // Merge strategy of Firestore cloud messages and local backup messages:
      // This protects against data loss when Firestore writes are blocked/denied by rules,
      // whilst still correctly displaying new local messages in the active feed.
      const mergedMap = new Map<string, Message>();
      
      // 1. Seed with existing local memory data
      if (db.messages && Array.isArray(db.messages)) {
        db.messages.forEach(m => {
          if (m && m.id) {
            mergedMap.set(m.id, m);
          }
        });
      }
      
      // 2. Overwrite or add with Firestore cloud results
      results.forEach(m => {
        if (m && m.id) {
          mergedMap.set(m.id, m);
        }
      });

      // 3. Sort chronologically by timestamp
      const mergedList = Array.from(mergedMap.values()).sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeA - timeB;
      });

      // Keep only the most recent 150 messages
      const finalMessages = mergedList.length > 150 ? mergedList.slice(mergedList.length - 150) : mergedList;
      
      // Update local storage representation
      db.messages = finalMessages;
      saveDB(db);

      return finalMessages;
    } catch (err: any) {
      console.error("Error reading messages from Firestore, falling back to JSON:", err.message || err);
    }
  }
  return db.messages;
}

// Save Chat Helper
async function saveMessageToDB(msg: Message): Promise<boolean> {
  let savedToFirestore = false;
  if (dbInstance) {
    const pathRef = `messages/${msg.id}`;
    try {
      const docRef = doc(dbInstance, "messages", msg.id);
      try {
        await setDoc(docRef, msg);
        savedToFirestore = true;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, pathRef);
      }
    } catch (err: any) {
      console.error("Error saving message to Firestore (will save to local memory):", err.message || err);
    }
  }
  
  // ALWAYS save to local database as backup/cache!
  db.messages.push(msg);
  if (db.messages.length > 150) {
    db.messages = db.messages.slice(db.messages.length - 150);
  }
  saveDB(db);
  return savedToFirestore;
}

// Clear Chats Helper
async function clearAllChatsFromDB(): Promise<boolean> {
  let clearedFirestore = false;
  if (dbInstance) {
    const pathRef = "messages";
    try {
      const msgsRef = collection(dbInstance, "messages");
      let querySnapshot;
      try {
        querySnapshot = await getDocs(msgsRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, pathRef);
      }

      const deletePromises: Promise<any>[] = [];
      querySnapshot.forEach((docSnap) => {
        const docPath = `messages/${docSnap.id}`;
        deletePromises.push(
          deleteDoc(docSnap.ref).catch((err: any) => {
            handleFirestoreError(err, OperationType.DELETE, docPath);
          })
        );
      });
      await Promise.all(deletePromises);
      clearedFirestore = true;
    } catch (err: any) {
      console.error("Error clearing messages from Firestore (will clear local memory):", err.message || err);
    }
  }
  
  // ALWAYS clear local representation as backup!
  db.messages = [];
  saveDB(db);
  return true;
}

// --- API ENDPOINTS ---

function getLangCode(langName: string): string {
  if (!langName) return "auto";
  const name = langName.toLowerCase().trim();
  if (name.includes("viet")) return "vi";
  if (name.includes("eng") || name === "en") return "en";
  if (name.includes("fren") || name === "fr") return "fr";
  if (name.includes("chin") || name.includes("trung") || name === "zh") return "zh-CN";
  return langName;
}

// Google Translate Proxy Engine via Google free GTX API & Gemini backup
app.post("/api/translate", async (req, res) => {
  try {
    const { text, sourceLang, targetLang } = req.body || {};

    if (!text || !text.trim()) {
      res.json({ translatedText: "" });
      return;
    }

    const cacheKey = `${sourceLang}->${targetLang}:${text.trim().toLowerCase()}`;
    if (translationCache[cacheKey]) {
      res.json({ translatedText: translationCache[cacheKey], cached: true });
      return;
    }

    // Phase 1: Try high-speed Google Translate free GTX API
    try {
      const sl = getLangCode(sourceLang);
      const tl = getLangCode(targetLang);
      const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
      
      const gRes = await fetch(gUrl);
      if (gRes.ok) {
        const gJson = await gRes.json();
        if (gJson && gJson[0]) {
          const translatedText = gJson[0].map((parts: any) => parts[0]).join("");
          
          // Save to cache
          translationCache[cacheKey] = translatedText;
          saveTranslationCache(translationCache);

          res.json({ translatedText });
          return;
        }
      }
    } catch (gErr) {
      console.warn("Free Google Translate API failed, trying Gemini backup:", gErr);
    }

    // Phase 2: If no Gemini API key and GTX failed, return original text
    if (!ai) {
      res.json({
        translatedText: text,
        fallback: true
      });
      return;
    }

    // Phase 3: Gemini translation backup
    try {
      const prompt = `Translate this text from ${sourceLang} to ${targetLang}. Only return the precise translation word or phrase without preamble, explanations, or quotes:\n\n${text}`;
      const result = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      const translatedText = result.text?.trim() || "";
      
      // Save to cache
      translationCache[cacheKey] = translatedText;
      saveTranslationCache(translationCache);

      res.json({ translatedText });
    } catch (err: any) {
      console.warn("Translation api error encountered:", err.message || err);
      
      // Detect quota/rate limit error (429 or RESOURCE_EXHAUSTED)
      const errStr = JSON.stringify(err).toLowerCase() + " " + String(err).toLowerCase();
      const isRateLimit = errStr.includes("429") || errStr.includes("quota") || errStr.includes("rate") || errStr.includes("exhausted");

      if (isRateLimit) {
        // Graceful Rate Limit Handling: find the longest matching substring prefix in the cache for the same lang direction!
        let bestFallback = "";
        let longestMatchLen = 0;
        const cleanText = text.trim().toLowerCase();

        for (const k of Object.keys(translationCache)) {
          if (k.startsWith(`${sourceLang}->${targetLang}:`)) {
            const cachedQuery = k.substring(`${sourceLang}->${targetLang}:`.length);
            if (cleanText.includes(cachedQuery) && cachedQuery.length > longestMatchLen) {
              longestMatchLen = cachedQuery.length;
              bestFallback = translationCache[k];
            }
          }
        }

        if (bestFallback) {
          res.json({ translatedText: bestFallback, fallback: true });
          return;
        }

        // If no substring match, return the original text itself so it behaves cleanly without failing
        res.json({ translatedText: text, fallback: true });
        return;
      }

      res.status(500).json({ error: "Translation failed: " + err.message, stack: err.stack });
    }
  } catch (error: any) {
    console.error("Top level translate crash:", error);
    res.status(500).json({ error: "Translation server error", message: error.message });
  }
});

// Chat Passcode validation
app.post("/api/chat/verify-passcode", async (req, res) => {
  try {
    const { passcode } = req.body || {};
    if (!passcode) {
      res.status(400).json({ error: "Passcode required" });
      return;
    }

    const currentPasscode = await getPasscode();
    const isValid = passcode === currentPasscode;
    res.json({ success: isValid });
  } catch (error: any) {
    console.error("Error in /api/chat/verify-passcode:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message, stack: error.stack });
  }
});

// Change Chat Passcode
app.post("/api/chat/change-passcode", async (req, res) => {
  try {
    const { oldPasscode, newPasscode } = req.body || {};
    if (!oldPasscode || !newPasscode) {
      res.status(400).json({ error: "Old and New passcodes are required" });
      return;
    }

    const currentPasscode = await getPasscode();
    if (oldPasscode !== currentPasscode) {
      res.status(403).json({ error: "Incorrect old passcode" });
      return;
    }

    const success = await setPasscode(newPasscode);
    if (success) {
      res.json({ success: true, message: "Passcode changed successfully in database" });
    } else {
      res.status(500).json({ error: "Failed to update passcode" });
    }
  } catch (error: any) {
    console.error("Error in /api/chat/change-passcode:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message, stack: error.stack });
  }
});

// Get Secret Chats
app.get("/api/chat/messages", async (req, res) => {
  try {
    const passcode = req.headers["x-chat-passcode"];
    const currentPasscode = await getPasscode();
    if (passcode !== currentPasscode) {
      res.status(401).json({ error: "Unauthorized access to chat" });
      return;
    }

    const messagesList = await getChatsFromDB();
    res.json({ messages: messagesList });
  } catch (error: any) {
    console.error("Error in /api/chat/messages:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message, stack: error.stack });
  }
});

// Send Secret Chat
app.post("/api/chat/send", async (req, res) => {
  try {
    const passcode = req.headers["x-chat-passcode"];
    const currentPasscode = await getPasscode();
    if (passcode !== currentPasscode) {
      res.status(401).json({ error: "Unauthorized access to chat" });
      return;
    }

    const { sender, text, runTranslationCloak } = req.body || {};
    if (!text || !text.trim()) {
      res.status(400).json({ error: "Message content required" });
      return;
    }

    const newMessage: Message = {
      id: Math.random().toString(36).substring(2, 11),
      sender: sender || "Anonymous",
      timestamp: new Date().toISOString(),
      text: text.trim(),
    };

    // If Translate Cloak mode is chosen, we translate it on the server automatically
    if (runTranslationCloak) {
      try {
        // Determine direction: we can translate Vietnamese -> English, or English -> Vietnamese
        // Let's default detect: if it contains typical Vietnamese tones, translate to English, else english to vietnamese.
        const hasVietnameseTones = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(text);
        const src = hasVietnameseTones ? "Vietnamese" : "English";
        const dest = hasVietnameseTones ? "English" : "Vietnamese";

        const cacheKey = `${src}->${dest}:${text.trim().toLowerCase()}`;
        newMessage.langPair = `${src === "Vietnamese" ? "VI" : "EN"} → ${dest === "Vietnamese" ? "VI" : "EN"}`;

        if (translationCache[cacheKey]) {
          newMessage.translation = translationCache[cacheKey];
        } else {
          let translatedText = "";

          // Try free Google Translate GTX API first for instant speeds
          try {
            const sl = src === "Vietnamese" ? "vi" : "en";
            const tl = dest === "Vietnamese" ? "vi" : "en";
            const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
            const gRes = await fetch(gUrl);
            if (gRes.ok) {
              const gJson = await gRes.json();
              if (gJson && gJson[0]) {
                translatedText = gJson[0].map((parts: any) => parts[0]).join("");
              }
            }
          } catch (gErr) {
            console.warn("Cloak free API failed:", gErr);
          }

          // Gemini backup if free API failed
          if (!translatedText) {
            if (ai) {
              const prompt = `Translate the phrase/sentence precisely from ${src} to ${dest}. Return ONLY the direct translation text without quotes or explanations:\n\n${text}`;
              const result = await ai.models.generateContent({
                model: "gemini-3.5-flash",
                contents: prompt,
              });
              translatedText = result.text?.trim() || "";
            } else {
              translatedText = `[Cloak Translation] ${text}`;
            }
          }

          if (translatedText) {
            translationCache[cacheKey] = translatedText;
            saveTranslationCache(translationCache);
            newMessage.translation = translatedText;
          }
        }
      } catch (err: any) {
        console.error("Cloaking translation error:", err);
        // Fallback to substring in cache if rate limit or error occurs
        const hasVietnameseTones = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(text);
        const src = hasVietnameseTones ? "Vietnamese" : "English";
        const dest = hasVietnameseTones ? "English" : "Vietnamese";
        let cacheFallback = "";
        let longestMatchLen = 0;
        const cleanText = text.trim().toLowerCase();

        for (const k of Object.keys(translationCache)) {
          if (k.startsWith(`${src}->${dest}:`)) {
            const cachedQuery = k.substring(`${src}->${dest}:`.length);
            if (cleanText.includes(cachedQuery) && cachedQuery.length > longestMatchLen) {
              longestMatchLen = cachedQuery.length;
              cacheFallback = translationCache[k];
            }
          }
        }

        newMessage.translation = cacheFallback || text.trim();
        newMessage.langPair = `${src === "Vietnamese" ? "VI" : "EN"} → ${dest === "Vietnamese" ? "VI" : "EN"}`;
      }
    }

    await saveMessageToDB(newMessage);
    res.json({ success: true, message: newMessage });
  } catch (error: any) {
    console.error("Error in /api/chat/send:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message, stack: error.stack });
  }
});

// Clear Secret Chat (Panic Button!)
app.post("/api/chat/clear", async (req, res) => {
  try {
    const passcode = req.headers["x-chat-passcode"];
    const currentPasscode = await getPasscode();
    if (passcode !== currentPasscode) {
      res.status(401).json({ error: "Unauthorized access to chat" });
      return;
    }

    const success = await clearAllChatsFromDB();
    if (success) {
      res.json({ success: true, message: "Chat history cleared instantly" });
    } else {
      res.status(500).json({ error: "Failed to clear chat history" });
    }
  } catch (error: any) {
    console.error("Error in /api/chat/clear:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message, stack: error.stack });
  }
});

// Diagnostics Endpoint to help verify environment variables and startup logs on production
app.get("/api/diagnostics", (req, res) => {
  try {
    // Mask apiKey for safety
    const safeConfig = firebaseAppConfig ? {
      ...firebaseAppConfig,
      apiKey: firebaseAppConfig.apiKey ? (firebaseAppConfig.apiKey.substring(0, 5) + "..." + firebaseAppConfig.apiKey.substring(firebaseAppConfig.apiKey.length - 4)) : "Not Set",
    } : null;

    res.json({
      status: "diagnostics",
      isVercel,
      nodeVersion: process.version,
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      detectedFirebaseConfig: safeConfig,
      startupLogs,
      envKeysPresent: Object.keys(process.env).filter(k => k.startsWith("FIREBASE_") || k === "GEMINI_API_KEY"),
      firestoreInitialized: !!dbInstance
    });
  } catch (diagErr: any) {
    res.status(500).json({ status: "error", error: diagErr.message });
  }
});

export default app;
