import { useRef, useState } from "react";
import { Download, FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorText, openClientFile, rpc, uploadClientFile } from "./api";
import { SectionCard } from "./ui";

type ClientFile = { id: string; name: string; path: string | null; created_at: string };

/** The client's own files, with "add a file" while the request is open. */
export function ClientFiles({
  service, token, files, fileFn, accept, canUpload, title = "Your files", onChange,
}: {
  service: "consultancy" | "data"; token: string; files: ClientFile[]; fileFn: string; accept: string;
  canUpload: boolean; title?: string; onChange: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!files.length && !canUpload) return null;
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(list)) {
        const path = await uploadClientFile(service, token, f);
        await rpc(fileFn, { p_token: token, p_path: path, p_name: f.name, p_size: f.size });
      }
      toast.success("Files received. Thank you.");
      onChange();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SectionCard
      title={title}
      right={
        canUpload && (
          <>
            <input ref={input} type="file" multiple accept={accept} className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" /> {busy ? "Uploading…" : "Add files"}
            </Button>
          </>
        )
      }
    >
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files yet.</p>
      ) : (
        <FileList files={files} onOpen={(path) => openClientFile(service, token, path)} />
      )}
    </SectionCard>
  );
}

export function FileList({ files, onOpen }: { files: { id: string; name: string; path: string | null }[]; onOpen: (path: string) => Promise<void> }) {
  return (
    <ul className="space-y-2">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          {f.path && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Download ${f.name}`}
              onClick={() => onOpen(f.path!).catch((e) => toast.error(errorText(e)))}
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
