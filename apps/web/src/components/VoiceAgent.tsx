import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage, type Answer, type CustomerProfile, type Deal, type VoiceAgentResponse } from "../lib/api";
import { Icon } from "./Icon";
import { Rosy } from "./Rosy";

type Mode = "dealmind" | "customer";
type Turn = {
  speaker: "user" | "agent";
  text: string;
  mode: Mode;
  evidenceCount?: number;
  groundedIn?: string[];
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type ConversationState = "IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING" | "ERROR";
type Props = {
  deal: Deal | undefined;
  onOpenEvidence: (answer: Answer) => void;
};
const MAX_CONVERSATION_ENTRIES = 24;
const DEFAULT_END_OF_TURN_DELAY_MS = 2_000;

function endOfTurnDelayMs() {
  if (typeof window === "undefined") return DEFAULT_END_OF_TURN_DELAY_MS;
  const configured = Number(window.localStorage.getItem("novaEndOfTurnMs"));
  return Number.isFinite(configured) && configured >= 500 ? configured : DEFAULT_END_OF_TURN_DELAY_MS;
}

function recognitionFactory() {
  const win = window as typeof window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition;
}

function spokenVersion(text: string) {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/\bHindsight memory\b/gi, "memory")
    .trim();
  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned];
  const limit = 420;
  const full = sentences.join(" ").trim();
  if (full.length <= limit) return full;
  const complete = sentences.reduce((spoken, sentence) => {
    const next = `${spoken} ${sentence}`.trim();
    return next.length <= limit ? next : spoken;
  }, "");
  return complete || cleaned.slice(0, limit).replace(/\s+\S*$/, "").trim();
}

function compatibleFallbackVoice() {
  if (!("speechSynthesis" in window)) return undefined;
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => /samantha/i.test(voice.name))
    ?? voices.find((voice) => /ava|zoe|karen|moira|tessa|fiona|serena/i.test(voice.name))
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("en"));
}

function mergeProfile(current: CustomerProfile, text: string): CustomerProfile {
  const next = { ...current };
  const normalized = text.replace(/\s+/g, " ").trim();
  const name = normalized.match(/\b(?:my name is|i am|i'm)\s+([A-Z][a-z]+)\b/i)?.[1];
  if (name) next.name = name;
  const location = normalized.match(/\bfrom\s+([A-Z][a-z]+(?:\s+(?!with\b|and\b|for\b)[A-Z][a-z]+)?)\b/i)?.[1];
  if (location) next.location = location;
  if (/\bdeveloper|software engineer|programmer\b/i.test(normalized)) next.role = "software developer";
  if (/\bAI engineer|machine learning engineer|ML engineer\b/i.test(normalized)) next.role = "AI engineer";
  const budget = normalized.match(/(?:₹|rs\.?|inr)\s?[\d.]+\s?(?:lakh|lakhs|l|k|crore|cr)?/i)?.[0]
    ?? normalized.match(/\b\d+(?:\.\d+)?\s?(?:lakh|lakhs)\b/i)?.[0];
  if (budget) next.budget = budget;
  const apps = ["Docker", "Android Studio", "Python", "Ollama", "Xcode", "VS Code", "Figma", "Premiere Pro", "Final Cut"];
  const mentionedApps = apps.filter((app) => new RegExp(`\\b${app.replace(" ", "\\s+")}\\b`, "i").test(normalized));
  if (mentionedApps.length) {
    const existing = next.apps ? next.apps.split(",").map((item) => item.trim()) : [];
    next.apps = Array.from(new Set([...existing, ...mentionedApps])).join(", ");
  }
  const storage = normalized.match(/\b(?:at least\s+)?(\d+(?:\.\d+)?\s?TB|\d+\s?GB)\b/i)?.[0];
  if (storage && /\bstorage|ssd|tb|gb\b/i.test(normalized)) next.storage = storage;
  if (/\blocal AI|large language model|LLM|Ollama|machine learning\b/i.test(normalized)) next.use_case = "local AI and development";
  if (/\bhot|overheat|battery|lag|slow|charging|spill|water\b/i.test(normalized)) next.concern = normalized.slice(0, 140);
  return next;
}

function profileSummary(profile: CustomerProfile) {
  return [
    profile.name && `Name: ${profile.name}`,
    profile.role && `Role: ${profile.role}`,
    profile.location && `Location: ${profile.location}`,
    profile.budget && `Budget: ${profile.budget}`,
    profile.storage && `Storage: ${profile.storage}`,
    profile.apps && `Apps: ${profile.apps}`,
    profile.use_case && `Use: ${profile.use_case}`,
  ].filter(Boolean) as string[];
}

function speak(
  text: string,
  onDone: () => void,
  onWarning: (message: string) => void,
  attempt = 0,
) {
  if (!("speechSynthesis" in window)) {
    onWarning("Speech synthesis is not available in this browser. The answer is shown in the transcript.");
    onDone();
    return;
  }
  const speechText = spokenVersion(text);
  if (!speechText) {
    onWarning("Nova returned an empty spoken response. The transcript has been kept for review.");
    onDone();
    return;
  }
  if (!window.speechSynthesis.getVoices().length) {
    if (attempt < 12) {
      window.setTimeout(() => speak(text, onDone, onWarning, attempt + 1), 120);
      return;
    }
    onWarning("No browser voices are available. The answer is shown in the transcript.");
    onDone();
    return;
  }
  const voices = window.speechSynthesis.getVoices();
  const samantha = voices.find((voice) => /samantha/i.test(voice.name));
  const voice = samantha ?? compatibleFallbackVoice();
  if (!voice) {
    onWarning("No compatible English voice is available. The answer is shown in the transcript.");
    onDone();
    return;
  }
  window.speechSynthesis.cancel();
  if (!samantha) {
    onWarning("Samantha voice is unavailable, so Nova is using the closest compatible English voice.");
  }
  const utterance = new SpeechSynthesisUtterance(speechText);
  utterance.voice = voice;
  utterance.rate = 0.98;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.onend = onDone;
  utterance.onerror = () => {
    onWarning("Speech playback stopped unexpectedly. The full answer is still visible in the transcript.");
    onDone();
  };
  window.speechSynthesis.speak(utterance);
}

export function VoiceAgent({ deal, onOpenEvidence }: Props) {
  const [mode, setMode] = useState<Mode>("dealmind");
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [conversationState, setConversationState] = useState<ConversationState>("IDLE");
  const [error, setError] = useState("");
  const [voiceWarning, setVoiceWarning] = useState("");
  const [speechPreview, setSpeechPreview] = useState("");
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile>({});
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const lastDealMindAnswer = useRef<Answer | null>(null);
  const recognizer = useRef<SpeechRecognitionLike | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const pendingSpeechRef = useRef("");
  const submittedSpeechRef = useRef("");
  const finalSegmentsRef = useRef<string[]>([]);
  const silenceTimerRef = useRef<number | null>(null);
  const activeRequestIdRef = useRef(0);
  const ignoreRecognitionEndRef = useRef(false);
  const speakingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const supportsSpeech = useMemo(() => Boolean(recognitionFactory()), []);
  const modeLabel = mode === "dealmind" ? "Rosy DealMind" : "MacBook guide";
  const activeName = mode === "dealmind" ? "Rosy" : "Nova";
  const rememberedProfile = profileSummary(customerProfile);
  const placeholders = {
    dealmind: deal
      ? `Ask Rosy about ${deal.company.name}...`
      : "Select a deal before using Rosy voice.",
    customer: "Ask Nova about MacBook Pro M5 Pro...",
  };

  useEffect(() => {
    mountedRef.current = true;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
    return () => {
      mountedRef.current = false;
      if ("speechSynthesis" in window) {
        window.speechSynthesis.onvoiceschanged = null;
        window.speechSynthesis.cancel();
      }
      audioRef.current?.pause();
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current);
      }
      recognizer.current?.stop();
    };
  }, []);

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  function stopSpeaking() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setSpeaking(false);
    if (!busyRef.current && !listening) setConversationState("IDLE");
  }

  async function speakWithKokoro(text: string, onDone: () => void) {
    if (window.navigator.userAgent.toLowerCase().includes("jsdom")) return false;
    const speechText = spokenVersion(text);
    if (!speechText) return false;
    try {
      const response = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: speechText, voice: "af_heart", speed: 1.0 }),
      });
      if (!response.ok) return false;
      const blob = await response.blob();
      if (!mountedRef.current) return true;
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = onDone;
      audio.onerror = onDone;
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }

  function speakReply(text: string, voiceMode: Mode = mode) {
    if (!text.trim()) {
      setVoiceWarning("The AI returned an empty response, so there was nothing to speak.");
      setSpeaking(false);
      setConversationState("IDLE");
      return;
    }
    setSpeaking(true);
    setConversationState("SPEAKING");
    const done = () => {
      if (mountedRef.current) {
        setSpeaking(false);
        setConversationState("IDLE");
      }
    };
    if (voiceMode === "customer") {
      void speakWithKokoro(text, done).then((usedKokoro) => {
        if (usedKokoro) return;
        if (mountedRef.current) {
          setVoiceWarning("Kokoro neural voice is unavailable, so Nova is using the browser voice fallback.");
        }
        speak(
          text,
          done,
          (message) => {
            if (mountedRef.current) setVoiceWarning(message);
          },
        );
      });
      return;
    }
    speak(
      text,
      done,
      (message) => {
        if (mountedRef.current) setVoiceWarning(message);
      },
    );
  }

  function clearEndOfTurnTimer() {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  function resetSpeechBuffer() {
    pendingSpeechRef.current = "";
    finalSegmentsRef.current = [];
    setSpeechPreview("");
  }

  async function send(text: string, requestId = activeRequestIdRef.current) {
    const prompt = text.trim();
    if (prompt.length < 2 || busyRef.current) return;
    if (mode === "dealmind" && !deal) {
      setError("Select a deal before using Rosy voice.");
      setConversationState("ERROR");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setConversationState("PROCESSING");
    setError("");
    setVoiceWarning("");
    setMessage("");
    setTurns((current) => [...current, { speaker: "user", text: prompt, mode }]);
    try {
      if (mode === "dealmind" && deal) {
        const { data } = await api.post<Answer>(`/deals/${deal.id}/ask`, {
          question: prompt,
        });
        if (requestId !== activeRequestIdRef.current) return;
        lastDealMindAnswer.current = data;
        setTurns((current) => [
          ...current,
          {
            speaker: "agent",
            text: data.answer,
            mode,
            evidenceCount: data.evidence.length,
          },
        ]);
        if (requestId === activeRequestIdRef.current) speakReply(data.answer, mode);
      } else {
        const nextProfile = mergeProfile(customerProfile, prompt);
        setCustomerProfile(nextProfile);
        const conversation = turns
          .slice(-MAX_CONVERSATION_ENTRIES)
          .map((turn) => `${turn.speaker}: ${turn.text}`);
        const { data } = await api.post<VoiceAgentResponse>("/deals/voice/novadesk", {
          message: prompt,
          conversation,
          customer_profile: nextProfile,
        });
        if (requestId !== activeRequestIdRef.current) return;
        setTurns((current) => [
          ...current,
          {
            speaker: "agent",
            text: data.reply,
            mode,
            groundedIn: data.grounded_in,
          },
        ]);
        speakReply(data.reply, mode);
      }
    } catch (caught) {
      setError(errorMessage(caught));
      setConversationState("ERROR");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function listen() {
    if (!supportsSpeech) {
      setError("This browser does not expose speech recognition. Type the message instead.");
      setConversationState("ERROR");
      return;
    }
    if (busyRef.current) return;
    if (listening) {
      finishQuestion();
      return;
    }
    stopSpeaking();
    activeRequestIdRef.current += 1;
    clearEndOfTurnTimer();
    resetSpeechBuffer();
    submittedSpeechRef.current = "";
    const Recognition = recognitionFactory();
    if (!Recognition) return;
    const instance = new Recognition();
    recognizer.current = instance;
    instance.lang = "en-US";
    instance.interimResults = true;
    instance.continuous = true;
    instance.onresult = (event) => {
      if (speakingRef.current || busyRef.current) return;
      const results = Array.from(event.results);
      clearEndOfTurnTimer();
      const stableFinals: string[] = [];
      let interim = "";
      for (const result of results) {
        const transcript = (result[0]?.transcript ?? "").trim();
        if (!transcript) continue;
        if (result.isFinal) {
          stableFinals.push(transcript);
        } else {
          interim = transcript;
        }
      }
      finalSegmentsRef.current = stableFinals;
      const combined = [...stableFinals, interim].join(" ").replace(/\s+/g, " ").trim();
      pendingSpeechRef.current = combined;
      setMessage(combined);
      setSpeechPreview(combined);
      silenceTimerRef.current = window.setTimeout(() => {
        finishQuestion();
      }, endOfTurnDelayMs());
    };
    instance.onerror = () => {
      clearEndOfTurnTimer();
      setError("Could not capture speech. Check microphone permission, then try again or type the message.");
      setConversationState("ERROR");
      setListening(false);
    };
    instance.onend = () => {
      setListening(false);
      if (ignoreRecognitionEndRef.current || busyRef.current || speakingRef.current) {
        ignoreRecognitionEndRef.current = false;
        return;
      }
      if (pendingSpeechRef.current.trim().length >= 2) {
        silenceTimerRef.current = window.setTimeout(() => {
          finishQuestion();
        }, endOfTurnDelayMs());
        return;
      }
      setConversationState("IDLE");
    };
    setListening(true);
    setConversationState("LISTENING");
    try {
      instance.start();
    } catch {
      setError("Microphone could not start. Check browser permission or type the message.");
      setConversationState("ERROR");
      setListening(false);
    }
  }

  function finishQuestion() {
    clearEndOfTurnTimer();
    const prompt = pendingSpeechRef.current.trim() || message.trim();
    ignoreRecognitionEndRef.current = true;
    recognizer.current?.stop();
    setListening(false);
    if (prompt.length < 2) {
      resetSpeechBuffer();
      setConversationState("IDLE");
      return;
    }
    if (prompt === submittedSpeechRef.current) return;
    submittedSpeechRef.current = prompt;
    resetSpeechBuffer();
    void send(prompt, activeRequestIdRef.current);
  }

  return (
    <section className="voice-agent" aria-label="Voice Agent">
      <div className="voice-stage">
        <div className="voice-stage-top">
          <button
            className="voice-circle-button"
            aria-label="Open transcript"
            onClick={() => setTranscriptOpen((open) => !open)}
          >
            <Icon name="chat" size={21} />
          </button>
          <div className="voice-mode-switch" role="tablist" aria-label="Voice mode">
            <button
              role="tab"
              aria-selected={mode === "dealmind"}
              className={mode === "dealmind" ? "active" : ""}
              onClick={() => setMode("dealmind")}
            >
              Rosy
            </button>
            <button
              role="tab"
              aria-selected={mode === "customer"}
              className={mode === "customer" ? "active" : ""}
              onClick={() => setMode("customer")}
            >
              Nova
            </button>
          </div>
          <button className="voice-circle-button" aria-label="Voice settings">
            <Icon name="focus" size={21} />
          </button>
        </div>
        <div className="voice-center">
          <div className={`agent-orb ${listening ? "listening" : ""} ${busy ? "thinking" : ""}`}>
            <span />
            <span />
            <span />
          </div>
          <div className="voice-status">
            <span>{modeLabel} · {conversationState}</span>
            <h2>
              {conversationState === "PROCESSING"
                ? `${activeName} is thinking...`
                : conversationState === "SPEAKING"
                  ? `${activeName} is speaking...`
                : conversationState === "LISTENING"
                  ? "Listening..."
                : conversationState === "ERROR"
                  ? "Needs attention."
                  : turns.length
                    ? `${activeName} is ready for the next question.`
                    : `Talk to ${activeName}.`}
            </h2>
            <p>
              {mode === "dealmind"
                ? "Ask about Acme risk, Ravi, next actions, or changes over time."
                : "Ask about performance, battery, ports, display, memory, or the best configuration."}
            </p>
          </div>
          {speechPreview && (
            <div className="voice-live-preview" aria-live="polite">
              <strong>Capturing question</strong>
              <p>{speechPreview}</p>
              <span>Nova will wait {Math.round(endOfTurnDelayMs() / 100) / 10}s after you stop speaking.</span>
            </div>
          )}
          {mode === "customer" && rememberedProfile.length > 0 && (
            <div className="voice-profile-memory" aria-label="Nova session memory">
              <strong>Nova remembers</strong>
              <div>
                {rememberedProfile.slice(0, 5).map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          )}
          <div className={`voice-transcript-drawer ${transcriptOpen || turns.length ? "open" : ""}`}>
            {turns.length ? (
              turns.slice(transcriptOpen ? -MAX_CONVERSATION_ENTRIES : -4).map((turn, index) => (
                <article key={`${turn.speaker}-${index}`} className={`voice-turn ${turn.speaker}`}>
                  <strong>{turn.speaker === "user" ? "You" : turn.mode === "dealmind" ? "Rosy" : "Nova"}</strong>
                  <p>{turn.text}</p>
                  {turn.evidenceCount !== undefined && (
                    <button
                      disabled={!lastDealMindAnswer.current?.evidence.length}
                      onClick={() => lastDealMindAnswer.current && onOpenEvidence(lastDealMindAnswer.current)}
                    >
                      {turn.evidenceCount} supporting memories
                    </button>
                  )}
                  {turn.groundedIn?.length ? (
                    <ul>
                      {turn.groundedIn.slice(0, 3).map((fact) => (
                        <li key={fact}>{fact}</li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="voice-hint">
                Try: "Why is Acme at risk?" or switch to Nova and ask, "Is the M5 Pro MacBook good for video editing?"
              </p>
            )}
          </div>
        </div>
        <form
          className="voice-dock"
          onSubmit={(event) => {
            event.preventDefault();
            void send(message);
          }}
        >
          <button type="button" className="voice-plus" aria-label="Show demo prompts" onClick={() => setTranscriptOpen(true)}>
            <Icon name="plus" size={25} />
          </button>
          <input
            aria-label="Voice agent message"
            value={message}
            disabled={busy}
            placeholder={mode === "dealmind" ? "Ask Rosy" : "Ask Nova"}
            onChange={(event) => setMessage(event.target.value)}
          />
          <button
            type="button"
            className={`voice-mic ${listening ? "recording" : ""}`}
            aria-label={listening ? "Finish question" : "Start listening"}
            onClick={listen}
          >
            <Icon name="mic" size={21} />
          </button>
          {listening && (
            <button type="button" className="voice-finish" onClick={finishQuestion}>
              Finish Question
            </button>
          )}
          <button
            type={speaking ? "button" : "submit"}
            className={`voice-close ${speaking ? "speaking" : ""}`}
            aria-label={speaking ? "Stop speaking" : "Send message"}
            disabled={!speaking && (busy || message.trim().length < 2)}
            onClick={speaking ? stopSpeaking : undefined}
          >
            <Icon name={speaking ? "close" : message.trim().length >= 2 ? "arrow" : "close"} size={23} />
          </button>
        </form>
        {turns.length > 4 && (
          <button
            type="button"
            className="voice-history-toggle"
            onClick={() => setTranscriptOpen((open) => !open)}
          >
            {transcriptOpen ? "Show recent only" : `Show full session history (${Math.min(turns.length, MAX_CONVERSATION_ENTRIES)} turns)`}
          </button>
        )}
        {voiceWarning && <div className="voice-warning" role="status">{voiceWarning}</div>}
        {error && <div className="voice-error" role="alert">{error}</div>}
      </div>
    </section>
  );
}
