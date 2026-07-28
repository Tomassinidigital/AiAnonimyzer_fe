import { useSessionStore } from "@/store/sessionStore";
import { llmAlertMessage } from "@/utils/llmAlert";

export function LlmAlert() {
  const llm = useSessionStore((s) => s.llm);
  const msg = llmAlertMessage(llm);
  if (!msg) return null;
  return (
    <div className={`llm-alert ${msg.level}`} role="alert">
      <span className="llm-alert-icon">⚠</span>
      <span>{msg.text}</span>
    </div>
  );
}
