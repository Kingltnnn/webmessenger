export interface Message {
  id: string;
  sender: string;
  timestamp: string;
  text: string;
  translation?: string;
  langPair?: string;
}

export interface ChatHistoryResponse {
  messages: Message[];
}

export interface TranslateRequest {
  text: string;
  sourceLang: string;
  targetLang: string;
}

export interface TranslateResponse {
  translatedText: string;
}

export type ChatViewMode = "classic" | "disguise";
