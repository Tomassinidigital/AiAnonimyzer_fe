import { App } from "antd";
import { useSessionStore } from "@/store/sessionStore";

export function JsonView() {
  const jsonExport = useSessionStore((s) => s.render?.json_export);
  const { message } = App.useApp();
  const text = jsonExport ? JSON.stringify(jsonExport, null, 2) : "";

  function copy() {
    navigator.clipboard.writeText(text);
    message.success("JSON copiato negli appunti.");
  }

  function download() {
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "rilevamenti.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  return (
    <>
      <div className="toolbar">
        <button className="btn-ghost" onClick={copy}>
          Copia JSON
        </button>
        <button className="btn-ghost" onClick={download}>
          Scarica JSON
        </button>
      </div>
      <pre className="doc-view mono">{text}</pre>
    </>
  );
}
