import { Checkbox, Segmented, Select, Upload } from "antd";
import type { UploadFile } from "antd";
import { useState } from "react";
import { getDemoText } from "@/api/endpoints";
import { useDemoListQuery } from "@/api/queries";
import { useUiStore, type SourceKind } from "@/store/uiStore";
import { useSessionStore } from "@/store/sessionStore";

export function SourceSection() {
  const source = useUiStore((s) => s.source);
  const docText = useUiStore((s) => s.docText);
  const pdfFast = useUiStore((s) => s.pdfFast);

  const setSource = useUiStore((s) => s.setSource);
  const setDocText = useUiStore((s) => s.setDocText);
  const setPdfFile = useUiStore((s) => s.setPdfFile);
  const setPdfFast = useUiStore((s) => s.setPdfFast);
  const setSettingsCollapsed = useUiStore((s) => s.setSettingsCollapsed);
  const markChoiceTouched = useUiStore((s) => s.markChoiceTouched);
  const resetSession = useSessionStore((s) => s.resetSession);

  const demoQ = useDemoListQuery();
  const [demoValue, setDemoValue] = useState<string | undefined>(undefined);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  function onSourceChange(next: SourceKind) {
    if (next === source) return;
    setSource(next);
    resetSession();
    setDocText("");
    setPdfFile(null);
    setFileList([]);
    setDemoValue(undefined);
    setSettingsCollapsed(false);
    markChoiceTouched();
  }

  async function onDemoSelect(key: string) {
    setDemoValue(key);
    try {
      const data = await getDemoText(key);
      setDocText(data.text);
      if (source !== "text") setSource("text");
      markChoiceTouched();
    } catch {
      /* fallback silenzioso */
    }
    setDemoValue(undefined); // permette di ricaricare lo stesso demo
  }

  return (
    <>
      <section className="field">
        <label className="field-label">
          Sorgente
          <span
            className="apply-tag"
            title="Cambiarla azzera i risultati: serve una nuova analisi"
          >
            nuova analisi
          </span>
        </label>
        <Segmented<SourceKind>
          block
          value={source}
          onChange={onSourceChange}
          options={[
            { label: "Testo", value: "text" },
            { label: "PDF", value: "pdf" },
          ]}
        />
      </section>

      {source === "text" && (
        <section className="field">
          <label className="field-label" htmlFor="doc-text">
            Testo del documento
          </label>
          <Select
            placeholder="— Carica testo demo —"
            value={demoValue}
            onChange={onDemoSelect}
            loading={demoQ.isLoading}
            options={(demoQ.data ?? []).map((d) => ({
              value: d.key,
              label: d.label,
              title: d.description,
            }))}
            style={{ marginBottom: 8 }}
          />
          <textarea
            id="doc-text"
            rows={10}
            placeholder="Incolla qui la bozza del documento di gara..."
            value={docText}
            onChange={(e) => setDocText(e.target.value)}
          />
        </section>
      )}

      {source === "pdf" && (
        <section className="field">
          <label className="field-label">Carica PDF</label>
          <Upload
            accept="application/pdf"
            maxCount={1}
            fileList={fileList}
            beforeUpload={(file) => {
              setPdfFile(file as unknown as File);
              setFileList([file as unknown as UploadFile]);
              markChoiceTouched();
              return false; // niente upload automatico: gestiamo noi al click Analizza
            }}
            onRemove={() => {
              setPdfFile(null);
              setFileList([]);
            }}
          >
            <button className="btn-ghost" type="button">
              Seleziona file PDF…
            </button>
          </Upload>
          <Checkbox
            checked={pdfFast}
            onChange={(e) => {
              setPdfFast(e.target.checked);
              markChoiceTouched();
            }}
            style={{ marginTop: 8 }}
          >
            Veloce — analizza solo le prime 4 pagine
          </Checkbox>
        </section>
      )}
    </>
  );
}
