import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type Credentials = { name: string; email: string; temporary_password: string };

/** Shows login details once, so staff can hand them over; they aren't stored anywhere readable. */
export default function CredentialsDialog({ credentials, onClose }: { credentials: Credentials | null; onClose: () => void }) {
  const text = credentials ? `Isoko Training Center login\nEmail: ${credentials.email}\nTemporary password: ${credentials.temporary_password}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Login details copied");
    } catch {
      toast.error("Couldn't copy; select the text instead");
    }
  };
  return (
    <Dialog open={credentials !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-gold" aria-hidden /> Login details for {credentials?.name}
          </DialogTitle>
          <DialogDescription>
            Share these now — this password is shown only once. They'll be asked to choose their own password when they first sign in.
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-2 rounded-lg bg-muted p-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Email</dt>
            <dd className="font-semibold">{credentials?.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Temporary password</dt>
            <dd className="select-all font-mono text-base font-bold">{credentials?.temporary_password}</dd>
          </div>
        </dl>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={copy}>
            <Copy className="h-4 w-4" /> Copy
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
