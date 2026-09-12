"use client";

import { useRef, useState } from "react";
import type { MediaUploadClass } from "@/lib/media/storage";

type UploadResult = { ok: boolean; status?: string; mediaId?: string; processingJobId?: string; error?: string };

export default function DirectMediaUpload({
  accept,
  mediaClass,
  metadata,
  label,
  onComplete,
  disabled = false
}: {
  accept: string;
  mediaClass: MediaUploadClass;
  metadata: Record<string, unknown>;
  label: string;
  onComplete?: (result: UploadResult) => void | Promise<void>;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<XMLHttpRequest | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<"idle" | "uploading" | "processing" | "complete" | "failed" | "canceled">("idle");
  const [error, setError] = useState("");

  async function start(selected: File | null = file) {
    if (!selected || disabled || state === "uploading") return;
    setFile(selected); setProgress(0); setError(""); setState("uploading");
    try {
      const authorizationResponse = await fetch("/api/admin/media/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...metadata, mediaClass, filename: selected.name, mimeType: selected.type, size: selected.size }) });
      const authorization = await authorizationResponse.json().catch(() => ({})) as { upload?: { sessionId: string; uploadUrl: string; headers?: Record<string, string> }; error?: string };
      if (!authorizationResponse.ok || !authorization.upload) throw new Error(authorization.error || "Secure direct upload is unavailable.");
      sessionIdRef.current = authorization.upload.sessionId;
      const result = await new Promise<UploadResult>((resolve, reject) => {
        const request = new XMLHttpRequest(); requestRef.current = request;
        request.open("POST", authorization.upload!.uploadUrl);
        Object.entries(authorization.upload!.headers || {}).forEach(([name, value]) => request.setRequestHeader(name, value));
        request.upload.addEventListener("progress", (event) => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); });
        request.addEventListener("abort", () => reject(new Error("Upload canceled.")));
        request.addEventListener("error", () => reject(new Error("The direct upload failed. You can retry.")));
        request.addEventListener("load", () => {
          if (request.status < 200 || request.status >= 300) { reject(new Error(`Storage upload failed (${request.status}).`)); return; }
          void fetch("/api/admin/media/upload/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: authorization.upload!.sessionId }) })
            .then(async (response) => ({ response, body: await response.json().catch(() => ({})) as UploadResult }))
            .then(({ response, body }) => response.ok ? resolve(body) : reject(new Error(body.error || "Upload completion failed.")))
            .catch(reject);
        });
        request.send(selected);
      });
      requestRef.current = null; sessionIdRef.current = null; setProgress(100); setState(result.status === "PROCESSING" ? "processing" : "complete"); await onComplete?.(result);
    } catch (caught) {
      requestRef.current = null;
      const message = caught instanceof Error ? caught.message : "Upload failed.";
      setError(message); setState(message === "Upload canceled." ? "canceled" : "failed");
    }
  }

  async function cancel() {
    requestRef.current?.abort();
    if (sessionIdRef.current) await fetch(`/api/admin/media/upload?sessionId=${encodeURIComponent(sessionIdRef.current)}`, { method: "DELETE" }).catch(() => undefined);
    sessionIdRef.current = null;
    setState("canceled");
    setError("Upload canceled.");
  }

  function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] || null;
    if (selected) void start(selected);
    event.target.value = "";
  }

  return <div className="direct-media-upload">
    <input ref={inputRef} type="file" accept={accept} onChange={choose} disabled={disabled || state === "uploading"} hidden />
    <button className="secondary" type="button" onClick={() => inputRef.current?.click()} disabled={disabled || state === "uploading"}>{label}</button>
    {state === "uploading" || state === "processing" ? <div className="direct-media-upload-status" role="status" aria-live="polite"><progress max={100} value={progress}>{progress}%</progress><span>{state === "processing" ? "Processing securely…" : `${progress}%`}</span><button type="button" className="secondary danger" onClick={() => void cancel()}>Cancel</button></div> : null}
    {state === "failed" || state === "canceled" ? <div className="direct-media-upload-status" role="alert"><span>{error}</span><button className="secondary" type="button" onClick={() => void start()}>Retry</button></div> : null}
    {state === "complete" ? <p className="admin-audio-status" role="status">Upload complete.</p> : null}
  </div>;
}
