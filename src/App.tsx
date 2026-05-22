import React, { useState, useEffect, useRef } from "react";
import { 
  ArrowLeftRight, 
  Mic, 
  Volume2, 
  Copy, 
  Share2, 
  Star, 
  Clock, 
  Check, 
  Menu,
  Sparkles,
  RefreshCw,
  Sliders,
  ChevronDown,
  Trash2,
  ThumbsUp,
  X,
  Send,
  HelpCircle
} from "lucide-react";
import { Message } from "./types";

export default function App() {
  // Main Input & Translation States
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [srcLang, setSrcLang] = useState("auto");
  const [destLang, setDestLang] = useState("en");
  const [charCount, setCharCount] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // Hidden Messaging States
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [secretMessages, setSecretMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [userAlias, setUserAlias] = useState<string>(() => {
    const saved = localStorage.getItem("cl_user_alias");
    if (saved === "An" || saved === "Nam") return saved;
    return "An";
  });
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [notificationToast, setNotificationToast] = useState<{
    id: string;
    sender: string;
    text: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerCode = "310123";
  const clientCacheRef = useRef<Record<string, string>>({});
  const pageLoadTime = useRef(Date.now() - 5000);
  const notifiedMsgIds = useRef<Set<string>>(new Set());

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Double Check Passcode Verification automatic unlock when typing trigger code
  useEffect(() => {
    if (sourceText.trim() === triggerCode) {
      setIsUnlocked(true);
      // Give a fake normal translation so it looks like plain numbers
      setTranslatedText(triggerCode);
    } else {
      if (isUnlocked && sourceText.trim() !== triggerCode) {
        setIsUnlocked(false);
      }
    }
  }, [sourceText]);

  // Swap source and destination languages (like real Google Translate)
  const handleSwapLanguages = () => {
    // Current source language
    const currentSrc = srcLang;
    // Current dest language
    const currentDest = destLang;

    // Convert source to target key
    let newDest = "en";
    if (currentSrc === "Vietnamese") newDest = "vi";
    else if (currentSrc === "English") newDest = "en";
    else if (currentSrc === "French") newDest = "en"; // default fallback
    else if (currentSrc === "auto") newDest = "vi"; // default automatic detects to Vietnamese, swap to English

    // Convert dest to source key
    let newSrc = "Vietnamese";
    if (currentDest === "vi") newSrc = "Vietnamese";
    else if (currentDest === "en") newSrc = "English";
    else if (currentDest === "zh") newSrc = "Chinese";

    setSrcLang(newSrc);
    setDestLang(newDest);

    // Swap texts
    const tempText = sourceText;
    setSourceText(translatedText);
    setTranslatedText(tempText);
  };

  // Real-time debounced auto translation as the user types (like Google Translate)
  useEffect(() => {
    if (!sourceText.trim()) {
      setTranslatedText("");
      return;
    }

    if (sourceText.trim() === triggerCode) {
      setTranslatedText(triggerCode);
      return;
    }

    // Check client-side cache for instantaneous (0ms) response
    const cacheKey = `${srcLang}->${destLang}:${sourceText.trim().toLowerCase()}`;
    if (clientCacheRef.current[cacheKey]) {
      setTranslatedText(clientCacheRef.current[cacheKey]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsTranslating(true);
      try {
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: sourceText,
            sourceLang: srcLang === "auto" ? "Vietnamese" : srcLang,
            targetLang: destLang === "vi" ? "Vietnamese" : destLang === "zh" ? "Chinese" : "English",
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setTranslatedText(data.translatedText);
          // Store in client-side cache
          clientCacheRef.current[cacheKey] = data.translatedText;
        }
      } catch (err) {
        console.error(err);
        setTranslatedText("Lỗi dịch thuật: Không kết nối được máy chủ Google Translate.");
      } finally {
        setIsTranslating(false);
      }
    }, 80); // Extremely short debounce for instant typing speed

    return () => clearTimeout(timer);
  }, [sourceText, srcLang, destLang]);

  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.12, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      // Play high-fidelity dual tone chime (G5 then C6 chord) to simulate real iOS notification sound
      playTone(784, audioCtx.currentTime, 0.22);
      playTone(1046, audioCtx.currentTime + 0.1, 0.3);
    } catch (err) {
      console.error("Audio synth error:", err);
    }
  };

  // Slide-down iOS Notification Toast auto-dismissal
  useEffect(() => {
    if (notificationToast) {
      const timer = setTimeout(() => {
        setNotificationToast(null);
      }, 5500);
      return () => clearTimeout(timer);
    }
  }, [notificationToast]);

  // Request standard Web Push notifications permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(err => console.error(err));
    }
  }, []);

  // Clear unread red dot instantly when entering the chat room or viewing active dialogue
  useEffect(() => {
    if (isUnlocked) {
      setHasUnread(false);
    }
  }, [isUnlocked, secretMessages]);

  // Background polling for messages (every 2.5s) to guarantee real-time unread alerts & notifications
  useEffect(() => {
    // Initial fetch immediately
    fetchMessages();

    const interval = setInterval(() => {
      fetchMessages();
    }, 2500);

    return () => clearInterval(interval);
  }, [userAlias, isUnlocked]);

  // Scroll to bottom of chat
  useEffect(() => {
    if (isUnlocked) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [secretMessages, isUnlocked]);

  const fetchMessages = async () => {
    try {
      const response = await fetch("/api/chat/messages", {
        method: "GET",
        headers: {
          "x-chat-passcode": triggerCode,
        },
      });
      if (response.ok) {
        const data = await response.json();
        const incomingMessages: Message[] = data.messages || [];

        // Check for newly received partner messages
        if (incomingMessages.length > 0) {
          incomingMessages.forEach((msg) => {
            const isFromPartner = msg.sender !== userAlias;
            const msgTime = new Date(msg.timestamp).getTime();
            const isNew = msgTime > pageLoadTime.current;

            if (isFromPartner && isNew && !notifiedMsgIds.current.has(msg.id)) {
              notifiedMsgIds.current.add(msg.id);

              if (!isUnlocked) {
                // Set the prominent red badge dot on the Translate "Nhật ký" action
                setHasUnread(true);

                // Play iOS push chime audio
                playNotificationSound();

                // Only show/simulate notification banner if the device is an iPhone/iPad/iOS
                const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || 
                  (navigator.userAgent.includes("Mac") && "ontouchend" in document);

                if (isIOS) {
                  // Trigger elegant slide-down iOS simulated notification banner
                  setNotificationToast({
                    id: msg.id,
                    sender: msg.sender,
                    text: msg.text,
                  });
                }

                // Display standard browser floating push notification (fully supports iOS desktop and Safari / systems)
                if ("Notification" in window && Notification.permission === "granted") {
                  try {
                    new Notification(`Tin nhắn mới từ ${msg.sender}`, {
                      body: msg.text,
                      icon: "https://ssl.gstatic.com/translate/favicon.ico",
                    });
                  } catch (e) {
                    console.warn("Failed to create native Notification in iframe sandbox, falling back perfectly to simulated slide-down UI banner.");
                  }
                }
              }
            }
          });
        }

        setSecretMessages(incomingMessages);
      }
    } catch (err) {
      console.error("Lỗi tải tin nhắn:", err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const textToSend = chatInput.trim();
    setChatInput("");

    try {
      const response = await fetch("/api/chat/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-chat-passcode": triggerCode,
        },
        body: JSON.stringify({
          sender: userAlias,
          text: textToSend,
        }),
      });

      if (response.ok) {
        fetchMessages();
      }
    } catch (err) {
      console.error("Lỗi gửi tin nhắn:", err);
    }
  };

  const clearMessages = async () => {
    if (!window.confirm("Xóa toàn bộ lịch sử tin nhắn kín?")) return;
    try {
      const response = await fetch("/api/chat/clear", {
        method: "POST",
        headers: {
          "x-chat-passcode": triggerCode,
        },
      });
      if (response.ok) {
        setSecretMessages([]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTranslateAction = async () => {
    if (!sourceText.trim()) return;

    if (sourceText.trim() === triggerCode) {
      setTranslatedText(triggerCode);
      return;
    }

    const cacheKey = `${srcLang}->${destLang}:${sourceText.trim().toLowerCase()}`;
    if (clientCacheRef.current[cacheKey]) {
      setTranslatedText(clientCacheRef.current[cacheKey]);
      return;
    }

    setIsTranslating(true);
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: sourceText,
          sourceLang: srcLang === "auto" ? "Vietnamese" : srcLang,
          targetLang: destLang === "vi" ? "Vietnamese" : "English",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setTranslatedText(data.translatedText);
        clientCacheRef.current[cacheKey] = data.translatedText;
      }
    } catch (err) {
      console.error(err);
      setTranslatedText("Lỗi dịch thuật: Không kết nối được máy chủ Google Translate.");
    } finally {
      setIsTranslating(false);
    }
  };

  const copyTranslatedText = () => {
    if (!translatedText) return;
    navigator.clipboard.writeText(translatedText);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const speakText = (text: string) => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "vi-VN";
      window.speechSynthesis.speak(utterance);
    }
  };


  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col font-sans select-none pb-8 text-[#303134] relative">
      
      {/* iOS Floating Push Notification Banner Overlay */}
      {notificationToast && (
        <div 
          onClick={() => {
            // Tap to open the secret messaging pane like magic!
            setSourceText("310123");
            setIsUnlocked(true);
            setNotificationToast(null);
          }}
          className="fixed top-4 left-4 right-4 md:left-auto md:right-4 md:w-[360px] bg-[#fdfdfd]/95 backdrop-blur-xl border border-white/40 shadow-2xl rounded-[22px] p-3.5 z-[9999] pointer-events-auto cursor-pointer transition-all duration-300 transform select-none hover:scale-[1.02] active:scale-95 animate-slide-down flex flex-col space-y-2 ring-1 ring-black/5"
        >
          {/* Header row resembling iOS status header */}
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center space-x-1.5 min-w-0">
              {/* Google Translate Small Icon */}
              <div className="w-4.5 h-4.5 rounded-[4px] bg-[#4285F4] flex items-center justify-center p-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.15)] overflow-hidden shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-full.5 h-full.5 text-white">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21a.75.75 0 01-.75-.75V3.75a.75.75 0 011.5 0v16.5a.75.75 0 01-.75.75z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5" />
                </svg>
              </div>
              <span className="text-[10px] text-gray-500 font-bold tracking-wider uppercase font-sans select-none overflow-hidden text-ellipsis whitespace-nowrap">
                Google Dịch
              </span>
              <span className="text-[10px] text-gray-400 font-medium font-sans">
                • mô phỏng iOS
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-gray-400 font-medium font-sans">
                bây giờ
              </span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setNotificationToast(null);
                }}
                className="w-4.5 h-4.5 rounded-full bg-gray-200/60 flex items-center justify-center text-gray-650 hover:bg-gray-200"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>

          {/* iOS Notification Content preview row */}
          <div className="flex items-start space-x-3 w-full">
            {/* Elegant avatar of the sender mirroring their drop-down profile avatar */}
            <div 
              className={`w-9 h-9 rounded-full text-white font-bold text-[11px] flex items-center justify-center shrink-0 shadow-3xs ${
                notificationToast.sender === "An" ? "bg-[#00796b]" : "bg-[#1a73e8]"
              }`}
            >
              {notificationToast.sender}
            </div>

            <div className="flex-1 min-w-0 text-left">
              <span className="block text-xs font-bold text-gray-900 leading-tight">
                {notificationToast.sender}
              </span>
              <p className="text-xs text-gray-600 font-normal leading-relaxed mt-0.5 select-text line-clamp-2">
                {notificationToast.text}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Header (Mimetized Google Translate Header) */}
      <header className="bg-white border-b border-gray-200 px-6 py-2.5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center space-x-3">
          <button className="p-2 hover:bg-gray-100 rounded-full text-gray-500 focus:outline-none transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="flex items-center space-x-1 select-none">
            <div className="flex text-2xl font-semibold font-display tracking-tight leading-none">
              <span className="text-[#4285F4]">G</span>
              <span className="text-[#EA4335]">o</span>
              <span className="text-[#FBBC05]">o</span>
              <span className="text-[#4285F4]">g</span>
              <span className="text-[#34A853]">l</span>
              <span className="text-[#EA4335]">e</span>
            </div>
            <span className="text-[22px] font-normal text-gray-500 font-display pl-1.5 leading-none">Dịch</span>
          </div>
        </div>

        {/* Right Header Status Bar */}
        <div className="flex items-center space-x-3">
          <button className="p-2 hover:bg-gray-100 rounded-full text-gray-500 focus:outline-none transition-colors">
            <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          
          <button className="p-2 hover:bg-gray-100 rounded-full text-gray-500 focus:outline-none transition-colors">
            <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          </button>

          {/* Dropdown Profile Picker - displaying only selected profile */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="flex items-center space-x-2 bg-white border border-gray-200 hover:border-gray-300 shadow-3xs hover:bg-gray-50 px-3 py-1.5 rounded-full cursor-pointer transition-all active:scale-95 text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              title="Thay đổi profile người dùng"
            >
              <div 
                className={`w-6 h-6 rounded-full text-white flex items-center justify-center font-bold text-[10px] relative shrink-0 ${
                  userAlias === "An" ? "bg-[#00796b]" : "bg-[#1a73e8]"
                }`}
              >
                {userAlias}
                <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-green-500 rounded-full border border-white" />
              </div>
              <span className="text-xs font-semibold">{userAlias}</span>
              <ChevronDown className="w-3 h-3 text-gray-500 transition-transform duration-200" style={{ transform: profileDropdownOpen ? 'rotate(180deg)' : 'rotate(0)' }} />
            </button>

            {profileDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-32 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 z-50 animate-fade-in font-sans">
                <button
                  onClick={() => {
                    setUserAlias("An");
                    localStorage.setItem("cl_user_alias", "An");
                    setProfileDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs font-semibold flex items-center space-x-2 transition-colors cursor-pointer ${
                    userAlias === "An" 
                      ? "text-teal-700 bg-teal-50" 
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-[#00796b] text-white text-[8px] font-bold flex items-center justify-center">An</span>
                  <span>An (Teal)</span>
                  {userAlias === "An" && <Check className="w-3.5 h-3.5 text-teal-700 ml-auto" />}
                </button>

                <button
                  onClick={() => {
                    setUserAlias("Nam");
                    localStorage.setItem("cl_user_alias", "Nam");
                    setProfileDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs font-semibold flex items-center space-x-2 transition-colors cursor-pointer ${
                    userAlias === "Nam" 
                      ? "text-blue-700 bg-blue-50" 
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-[#1a73e8] text-white text-[8px] font-bold flex items-center justify-center">Nam</span>
                  <span>Nam (Blue)</span>
                  {userAlias === "Nam" && <Check className="w-3.5 h-3.5 text-blue-700 ml-auto" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-[1280px] w-full mx-auto px-6 py-6 flex-1 flex flex-col space-y-7">
        
        {/* Navigation Tabs (Văn bản, Hình ảnh, Tài liệu, Trang web) as in the picture */}
        <div className="flex items-center space-x-2 text-xs font-medium">
          <button className="px-4 py-2 bg-[#e8f0fe] text-[#1a73e8] rounded-full flex items-center space-x-1.5 border border-transparent shadow-2xs">
            <MessageSquareIcon className="w-4 h-4" />
            <span className="font-semibold text-sm">Văn bản</span>
          </button>
          
          <button className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-full flex items-center space-x-1.5 border border-gray-250 shadow-3xs cursor-not-allowed">
            <ImageIcon className="w-4 h-4 text-gray-500" />
            <span className="text-sm">Hình ảnh</span>
          </button>

          <button className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-full flex items-center space-x-1.5 border border-gray-250 shadow-3xs cursor-not-allowed">
            <FileIcon className="w-4 h-4 text-gray-500" />
            <span className="text-sm">Tài liệu</span>
          </button>

          <button className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-full flex items-center space-x-1.5 border border-gray-250 shadow-3xs cursor-not-allowed">
            <GlobeIcon className="w-4 h-4 text-gray-500" />
            <span className="text-sm">Trang web</span>
          </button>
        </div>

        {/* Language Selection Header (Cân đối, đưa ra ngoài khung viền) */}
        <div className="flex flex-col md:flex-row items-center justify-between border-b border-gray-200 pb-3 text-xs font-semibold text-gray-500 gap-3 md:gap-0">
          
          {/* Left languages (Source) */}
          <div className="flex items-center space-x-1.5 md:space-x-3 w-full md:w-[46%] overflow-x-auto no-scrollbar scroll-smooth">
            <button 
              onClick={() => setSrcLang("auto")}
              className={`px-3 py-1.5 rounded-full shrink-0 transition-colors ${srcLang === "auto" ? "text-blue-600 font-bold bg-[#e8f0fe] shadow-3xs" : "hover:text-[#1a73e8] hover:bg-gray-100/80"}`}
            >
              Phát hiện ngôn ngữ
            </button>
            <button 
              onClick={() => setSrcLang("English")}
              className={`px-3 py-1.5 rounded-full shrink-0 transition-colors ${srcLang === "English" ? "text-blue-600 font-bold bg-[#e8f0fe] shadow-3xs" : "hover:text-[#1a73e8] hover:bg-gray-100/80"}`}
            >
              Tiếng Anh
            </button>
            <button 
              onClick={() => setSrcLang("Vietnamese")}
              className={`px-3 py-1.5 rounded-full shrink-0 transition-colors ${srcLang === "Vietnamese" ? "text-blue-600 font-bold bg-[#e8f0fe] shadow-3xs" : "hover:text-[#1a73e8] hover:bg-gray-100/80"}`}
            >
              Tiếng Việt
            </button>
            <button 
              onClick={() => setSrcLang("French")}
              className={`px-3 py-1.5 rounded-full shrink-0 transition-colors ${srcLang === "French" ? "text-blue-600 font-bold bg-[#e8f0fe] shadow-3xs" : "hover:text-[#1a73e8] hover:bg-gray-100/80"}`}
            >
              Tiếng Pháp
            </button>
            <button className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 shrink-0">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Swap Button in center */}
          <div className="flex items-center justify-center shrink-0">
            <button 
              onClick={handleSwapLanguages}
              className="p-2.5 bg-white border border-gray-200 hover:border-gray-300 shadow-3xs hover:bg-gray-50 rounded-full transition-all active:scale-95 text-gray-500 hover:text-[#1a73e8]"
              title="Chuyển đổi ngôn ngữ chính"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          </div>

          {/* Right languages (Target) */}
          <div className="flex items-center space-x-1.5 md:space-x-3 w-full md:w-[46%] justify-start md:justify-end overflow-x-auto no-scrollbar scroll-smooth">
            <button 
              onClick={() => setDestLang("vi")}
              className={`px-3 py-1.5 rounded-full shrink-0 transition-colors ${destLang === "vi" ? "text-blue-600 font-bold bg-white border border-gray-250 shadow-3xs" : "hover:text-[#1a73e8] hover:bg-gray-100/80"}`}
            >
              Tiếng Việt
            </button>
            <button 
              onClick={() => setDestLang("en")}
              className={`px-3 py-1.5 rounded-full shrink-0 transition-colors ${destLang === "en" ? "text-blue-600 font-bold bg-white border border-gray-250 shadow-3xs" : "hover:text-[#1a73e8] hover:bg-gray-100/80"}`}
            >
              Tiếng Anh
            </button>
            <button 
              onClick={() => setDestLang("zh")}
              className={`px-3 py-1.5 rounded-full shrink-0 transition-colors ${destLang === "zh" ? "text-blue-600 font-bold bg-white border border-gray-250 shadow-3xs" : "hover:text-[#1a73e8] hover:bg-gray-100/80"}`}
            >
              Tiếng Trung
            </button>
            <button className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 shrink-0">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Translation Box (Vùng hộp dịch chỉ chứa nội dung chính) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-250 rounded-2xl overflow-hidden border border-gray-200 shadow-3xs">
          
          {/* Card Left - Source Input Area */}
          <div className="bg-white p-5 flex flex-col min-h-[170px]">
            
            {/* Textarea for gõ chữ */}
            <div className="flex-1 relative">
              <textarea
                value={sourceText}
                onChange={(e) => {
                  setSourceText(e.target.value);
                  setCharCount(e.target.value.length);
                }}
                placeholder="Nhập văn bản cần dịch..."
                className="w-full h-full min-h-[120px] text-gray-900 text-lg md:text-xl resize-none focus:outline-none placeholder-gray-400 leading-relaxed pr-6"
              />
              {sourceText && (
                <button 
                  onClick={() => {
                    setSourceText("");
                    setCharCount(0);
                    setTranslatedText("");
                  }}
                  className="absolute right-0 top-0.5 text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-150 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Bottom Actions Left */}
            <div className="pt-2 flex items-center justify-between mt-auto">
              <div className="flex items-center space-x-2 text-gray-400">
                <button className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 focus:outline-none transition-colors">
                  <Mic className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => speakText(sourceText)}
                  disabled={!sourceText}
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 disabled:opacity-30 focus:outline-none transition-colors"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>

              {/* Character counting & pencil icon */}
              <div className="flex items-center space-x-3 text-xs text-gray-400 font-mono">
                <span>{charCount}</span>
                <button 
                  onClick={handleTranslateAction}
                  className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              </div>
            </div>

          </div>

          {/* Card Right - Target Output Area (Disguise styled right box) */}
          <div className="bg-[#f0f4f9] p-5 flex flex-col min-h-[170px] border-l border-gray-100 relative">
            
            {/* Absolute positioning bookmark icon for sleek minimalism */}
            <div className="absolute top-4 right-4 z-10">
              <button className="p-2 hover:bg-gray-250 rounded-full text-gray-400 hover:text-amber-500 transition-all">
                <Star className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Translation Output render */}
            <div className={`flex-1 text-gray-900 text-lg md:text-xl leading-relaxed whitespace-pre-wrap min-h-[120px] transition-all duration-200 pr-8 ${isTranslating ? "opacity-55" : "opacity-100"}`}>
              {translatedText ? (
                <span>{translatedText}</span>
              ) : (
                <span className="text-gray-400 text-base font-normal">
                  {isTranslating ? "Đang dịch..." : "Bản dịch"}
                </span>
              )}
            </div>

            {/* Bottom Actions Right */}
            <div className="pt-2 flex items-center justify-between mt-auto">
              <div className="flex items-center space-x-1.5 text-gray-400">
                <button 
                  onClick={() => speakText(translatedText)}
                  disabled={!translatedText}
                  className="p-2 hover:bg-gray-250 rounded-full text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                  title="Nghe phát âm"
                >
                  <Volume2 className="w-4.5 h-4.5" />
                </button>
                <button 
                  onClick={copyTranslatedText} 
                  disabled={!translatedText}
                  className="p-2 hover:bg-gray-250 rounded-full text-gray-400 hover:text-gray-600 disabled:opacity-30 relative transition-colors"
                  title="Sao chép"
                >
                  {copiedText ? <Check className="w-4.5 h-4.5 text-green-600" /> : <Copy className="w-4.5 h-4.5" />}
                </button>
                
                {/* Search "G" Google button inside target box */}
                <button className="p-2 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors" title="Tìm trên Google">
                  <span className="font-semibold text-sm select-none font-display">G</span>
                </button>

                {/* thumbs down & thumbs up icon feedback */}
                <button className="p-2 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors" title="Đóng góp ý kiến">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                  </svg>
                </button>
                
                <button className="p-2 hover:bg-gray-250 rounded-full text-gray-400 hover:text-gray-600 transition-colors" title="Chia sẻ">
                  <Share2 className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* FeedBack link on right corner as in image */}
              <span className="text-[11px] text-gray-400 font-normal italic select-none">
                Gửi ý kiến phản hồi
              </span>
            </div>

          </div>

        </div>

        {/* Action icons round in the middle bottom (Nhật ký, Đã lưu) */}
        <div className="flex items-center justify-center space-x-12 py-3">
          <div className="flex flex-col items-center space-y-2 select-none group cursor-pointer relative">
            <div className="w-13 h-13 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-3xs group-hover:bg-gray-50 transition-colors relative">
              <Clock className="w-5.5 h-5.5 text-[#5f6368]" />
              {hasUnread && (
                <>
                  <span className="absolute top-1.5 right-1.5 w-3 h-3 bg-red-500 rounded-full border border-white" />
                  <span className="absolute top-1.5 right-1.5 w-3 h-3 bg-red-500 rounded-full border border-white animate-ping opacity-75" />
                </>
              )}
            </div>
            <span className="text-[11px] text-[#5f6368] font-medium">Nhật ký</span>
          </div>

          <div className="flex flex-col items-center space-y-2 select-none group cursor-pointer">
            <div className="w-13 h-13 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-3xs group-hover:bg-gray-50 transition-colors">
              <Star className="w-5.5 h-5.5 text-[#5f6368]" />
            </div>
            <span className="text-[11px] text-[#5f6368] font-medium">Đã lưu</span>
          </div>
        </div>

        {/* LOWER SECTION / THE BOTTOM AREA */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          
          {/* Left Column at the bottom is empty, styled simple */}
          <div className="text-xs text-gray-400 font-normal flex flex-col justify-end">
            <p className="hidden md:block select-none py-1 text-gray-400">
              Hỗ trợ dịch thuật hơn 100 ngôn ngữ bằng mạng nơ-ron thông minh.
            </p>
          </div>

          {/* RIGHT COLUMN (VÙNG MÀU ĐỎ TRÊN ẢNH) - CHAT KÍN ĐÁO SỐ 1 */}
          <div className="relative min-h-[120px] p-4 bg-transparent transition-all duration-300">
            
            {/* When trigger passcode NOT typed -> show a single elegant | character as a click target hidden input */}
            {!isUnlocked ? (
              <div className="absolute bottom-4 right-4 flex items-center justify-end">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setChatInput(val);
                    if (val.trim() === triggerCode) {
                      setIsUnlocked(true);
                      setChatInput("");
                    }
                  }}
                  placeholder="|"
                  className="w-16 text-right text-[15px] text-[#303134]/10 hover:text-[#303134]/30 focus:text-[#303134]/40 placeholder-[#ababab]/70 bg-transparent border-none outline-none focus:outline-none focus:ring-0 cursor-text font-mono transition-colors"
                  title="Nhập mật mã để mở khoá"
                />
              </div>
            ) : (
              /* Hidden Chat Panel active when typing "310123" - Completely transparent and disguised to be plain text lines */
              <div className="flex flex-col space-y-3 bg-transparent animate-fade-in relative z-20 text-right pr-2">
                
                {/* Message display container - beautiful chat session showing active dialogs, scrollable upwards */}
                <div className="space-y-3 h-[130px] overflow-y-auto pr-1 scroll-smooth no-scrollbar py-1">
                  {secretMessages.length === 0 ? (
                    <div className="text-right text-gray-400 text-sm italic select-none">
                      (Không có dữ liệu lưu trữ)
                    </div>
                  ) : (
                    secretMessages.map((msg) => {
                      const isMe = msg.sender === userAlias;
                      
                      return (
                        <div 
                          key={msg.id} 
                          className={`flex flex-col text-[13px] leading-snug tracking-wide transition-all ${
                            isMe ? "items-end" : "items-start"
                          }`}
                        >
                          <div className="max-w-[85%]">
                            {/* Message text with beautiful, clean backplate for me, or borderless/transparent for others */}
                            <div className={isMe 
                              ? "px-2.5 py-1.5 rounded-2xl bg-white text-[#303134] border border-gray-200 rounded-br-none shadow-3xs text-left select-text" 
                              : "text-[#303134] text-left select-text py-0.5"
                            }>
                              {msg.text}
                            </div>
                          </div>
                          
                          {/* Disguised extremely tiny sender & timestamp prefix aligned under the message bubble */}
                          <span className={`text-[9px] text-[#5f6368]/60 mt-0.5 select-none px-1.5`}>
                            {msg.sender} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Extremely simple and borderless input field disguised on the white space */}
                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const trimmed = chatInput.trim();
                    if (!trimmed) return;
                    
                    if (trimmed === "/clear") {
                      setChatInput("");
                      try {
                        const response = await fetch("/api/chat/clear", {
                          method: "POST",
                          headers: {
                            "x-chat-passcode": triggerCode,
                          },
                        });
                        if (response.ok) {
                          setSecretMessages([]);
                        }
                      } catch (err) {
                        console.error(err);
                      }
                      return;
                    }

                    if (trimmed.startsWith("/name ")) {
                      const newAlias = trimmed.substring(6).trim();
                      if (newAlias) {
                        setUserAlias(newAlias);
                        localStorage.setItem("cl_user_alias", newAlias);
                      }
                      setChatInput("");
                      return;
                    }

                    setChatInput("");
                    try {
                      const response = await fetch("/api/chat/send", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "x-chat-passcode": triggerCode,
                        },
                        body: JSON.stringify({
                          sender: userAlias,
                          text: trimmed,
                        }),
                      });

                      if (response.ok) {
                        fetchMessages();
                      }
                    } catch (err) {
                      console.error("Lỗi gửi tin nhắn:", err);
                    }
                  }} 
                  className="mt-1"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="|"
                    className="w-full text-right text-[15px] text-[#303134] placeholder-[#ababab] bg-transparent border-none outline-none focus:outline-none focus:ring-0 active:bg-transparent cursor-text font-mono"
                  />
                </form>

              </div>
            )}

          </div>

        </div>

      </main>

      {/* Disguised Google Footer */}
      <footer className="mt-auto border-t border-gray-200 bg-white py-4 px-6 text-xs text-gray-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4">
            <a href="https://about.google/" target="_blank" rel="noreferrer" className="hover:underline">Giới thiệu về Google</a>
            <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="hover:underline">Bảo mật & Điều khoản</a>
            <a href="https://support.google.com/" target="_blank" rel="noreferrer" className="hover:underline">Trợ giúp</a>
          </div>
          
          <div className="flex items-center space-x-1">
            <span>© Google</span>
          </div>
        </div>
      </footer>

    </div>
  );
}

// Subordinate SVG Icons mimic to keep JSX extremely clean
function MessageSquareIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={props.className} width="16" height="16">
      <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" />
    </svg>
  );
}

function ImageIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className} width="16" height="16">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function FileIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className} width="16" height="16">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function GlobeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className} width="16" height="16">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
