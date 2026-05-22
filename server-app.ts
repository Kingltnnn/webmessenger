import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, orderBy, limit } from "firebase/firestore";

dotenv.config();

const app = express();

app.use(express.json());

// Initialize Gemini SDK
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Support Vercel Serverless ephemeral writing in /tmp, fallback to cwd for local development
const isVercel = process.env.VERCEL === "1" || !!process.env.NOW_BUILD;
const storageDir = isVercel ? "/tmp" : process.cwd();

// Simple Translation Cache Persistence
const TRANSLATION_CACHE_FILE = path.join(storageDir, "translation_cache.json");

interface TranslationCache {
  [key: string]: string; // key matches "sourceLang->targetLang:query"
}

let translationCache: TranslationCache = {};

function loadTranslationCache(): TranslationCache {
  try {
    if (fs.existsSync(TRANSLATION_CACHE_FILE)) {
      const data = fs.readFileSync(TRANSLATION_CACHE_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading translation cache file:", error);
  }
  return {};
}

function saveTranslationCache(cache: TranslationCache) {
  try {
    fs.writeFileSync(TRANSLATION_CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing translation cache file:", error);
  }
}

// Load cache from disk
translationCache = loadTranslationCache();

// Simple JSON DB File Persistence
const DB_FILE = path.join(storageDir, "chat_storage.json");

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
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf-8");
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
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing database file:", error);
  }
}

// In-Memory fallback cache in case write fails
let db: ChatStore = loadDB();

// Initialize Firebase dynamically if keys are present
let firebaseAppConfig: any = null;

if (process.env.FIREBASE_PROJECT_ID) {
  firebaseAppConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
    databaseId: process.env.FIREBASE_DATABASE_ID || "(default)"
  };
} else {
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const configData = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      firebaseAppConfig = {
        apiKey: configData.apiKey,
        authDomain: configData.authDomain,
        projectId: configData.projectId,
        storageBucket: configData.storageBucket,
        messagingSenderId: configData.messagingSenderId,
        appId: configData.appId,
        measurementId: configData.measurementId,
        databaseId: configData.firestoreDatabaseId || "(default)"
      };
    }
  } catch (err) {
    // Ignore
  }

  // Fallback to user's explicit provided Firebase coordinates
  if (!firebaseAppConfig) {
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
  try {
    const fApp = getApps().length === 0 ? initializeApp(firebaseAppConfig) : getApp();
    dbInstance = getFirestore(fApp, firebaseAppConfig.databaseId);
    console.log("Firebase Firestore active & connected for chat backend!");
  } catch (err) {
    console.error("Failed to initialize Firebase app:", err);
  }
}

// Passcode Getter helper
async function getPasscode(): Promise<string> {
  if (dbInstance) {
    try {
      const docRef = doc(dbInstance, "chat_settings", "global");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const pc = docSnap.data().passcode;
        if (pc) {
          db.passcode = pc;
          saveDB(db);
          return pc;
        }
      } else {
        await setDoc(docRef, { passcode: db.passcode });
      }
    } catch (err) {
      console.error("Error reading passcode from Firestore (falling back to local memory):", err);
    }
  }
  return db.passcode;
}

// Passcode Setter helper
async function setPasscode(newPasscode: string): Promise<boolean> {
  let savedToFirestore = false;
  if (dbInstance) {
    try {
      const docRef = doc(dbInstance, "chat_settings", "global");
      await setDoc(docRef, { passcode: newPasscode });
      savedToFirestore = true;
    } catch (err) {
      console.error("Error writing passcode to Firestore (falling back to local memory):", err);
    }
  }
  db.passcode = newPasscode;
  saveDB(db);
  return true;
}

// Get Chats Helper
async function getChatsFromDB(): Promise<Message[]> {
  if (dbInstance) {
    try {
      const msgsRef = collection(dbInstance, "messages");
      const q = query(msgsRef, orderBy("timestamp", "asc"), limit(150));
      const querySnapshot = await getDocs(q);
      const results: Message[] = [];
      querySnapshot.forEach((docSnap) => {
        results.push(docSnap.data() as Message);
      });
      
      // Update local storage so it has the latest synced messages if successful
      if (results.length > 0) {
        db.messages = results;
        saveDB(db);
      }
      return results;
    } catch (err) {
      console.error("Error reading messages from Firestore, falling back to JSON:", err);
    }
  }
  return db.messages;
}

// Save Chat Helper
async function saveMessageToDB(msg: Message): Promise<boolean> {
  let savedToFirestore = false;
  if (dbInstance) {
    try {
      const docRef = doc(dbInstance, "messages", msg.id);
      await setDoc(docRef, msg);
      savedToFirestore = true;
    } catch (err) {
      console.error("Error saving message to Firestore (will save to local memory):", err);
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
    try {
      const msgsRef = collection(dbInstance, "messages");
      const querySnapshot = await getDocs(msgsRef);
      const deletePromises: Promise<void>[] = [];
      querySnapshot.forEach((docSnap) => {
        deletePromises.push(deleteDoc(docSnap.ref));
      });
      await Promise.all(deletePromises);
      clearedFirestore = true;
    } catch (err) {
      console.error("Error clearing messages from Firestore (will clear local memory):", err);
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
  const { text, sourceLang, targetLang } = req.body;

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

    res.status(500).json({ error: "Translation failed: " + err.message });
  }
});

// Chat Passcode validation
app.post("/api/chat/verify-passcode", async (req, res) => {
  const { passcode } = req.body;
  if (!passcode) {
    res.status(400).json({ error: "Passcode required" });
    return;
  }

  const currentPasscode = await getPasscode();
  const isValid = passcode === currentPasscode;
  res.json({ success: isValid });
});

// Change Chat Passcode
app.post("/api/chat/change-passcode", async (req, res) => {
  const { oldPasscode, newPasscode } = req.body;
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
});

// Get Secret Chats
app.get("/api/chat/messages", async (req, res) => {
  const passcode = req.headers["x-chat-passcode"];
  const currentPasscode = await getPasscode();
  if (passcode !== currentPasscode) {
    res.status(401).json({ error: "Unauthorized access to chat" });
    return;
  }

  const messagesList = await getChatsFromDB();
  res.json({ messages: messagesList });
});

// Send Secret Chat
app.post("/api/chat/send", async (req, res) => {
  const passcode = req.headers["x-chat-passcode"];
  const currentPasscode = await getPasscode();
  if (passcode !== currentPasscode) {
    res.status(401).json({ error: "Unauthorized access to chat" });
    return;
  }

  const { sender, text, runTranslationCloak } = req.body;
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
});

// Clear Secret Chat (Panic Button!)
app.post("/api/chat/clear", async (req, res) => {
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
});

export default app;
