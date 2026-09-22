import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Command as CommandPrimitive } from "cmdk";
import { ArrowRight, LayoutGrid, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CATEGORIES, QUICK_ACCESS, SERVICES, searchServices, serviceById, type Service } from "@/lib/services";
import { cn } from "@/lib/utils";

// Search every Isoko service from anywhere: the search button in the header,
// or Ctrl/⌘ + K. Words are matched against names, descriptions and everyday
// terms ("hotel", "parcel", "certificate"), best matches first.

const SearchContext = createContext<{ open: () => void }>({ open: () => {} });
export const useServiceSearch = () => useContext(SearchContext);

const itemClass =
  "flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none data-[selected=true]:bg-muted";
const groupClass =
  "px-2 pb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground";

function ResultItem({ s, onGo }: { s: Service; onGo: (path: string) => void }) {
  return (
    <>
      <CommandPrimitive.Item value={`${s.id}-open`} onSelect={() => onGo(s.path)} className={itemClass}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <s.icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{s.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{s.description}</span>
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </CommandPrimitive.Item>
      <CommandPrimitive.Item value={`${s.id}-action`} onSelect={() => onGo(s.action.path)} className={cn(itemClass, "pl-14 text-primary")}>
        {s.action.label}
      </CommandPrimitive.Item>
    </>
  );
}

export function ServiceSearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const results = useMemo(() => searchServices(query), [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!isOpen) setQuery("");
  }, [isOpen]);

  const go = useCallback(
    (path: string) => {
      setOpen(false);
      navigate(path);
    },
    [navigate],
  );

  return (
    <SearchContext.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent className="top-[12vh] max-w-xl translate-y-0 overflow-hidden p-0 sm:top-[15vh]">
          <DialogTitle className="sr-only">Search Isoko services</DialogTitle>
          <CommandPrimitive shouldFilter={false} loop className="flex flex-col">
            <div className="flex items-center gap-2 border-b px-4">
              <Search className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              <CommandPrimitive.Input
                value={query}
                onValueChange={setQuery}
                placeholder="What do you need? e.g. send a parcel, hotel, course…"
                className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
            </div>
            <CommandPrimitive.List className="max-h-[60vh] overflow-y-auto py-2">
              {query.trim() ? (
                results.length ? (
                  <CommandPrimitive.Group heading={`${results.length} ${results.length === 1 ? "service" : "services"}`} className={groupClass}>
                    {results.map((s) => <ResultItem key={s.id} s={s} onGo={go} />)}
                  </CommandPrimitive.Group>
                ) : (
                  <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                    No service matches “{query.trim()}”.
                    <button type="button" onClick={() => go("/services")} className="mt-2 block w-full font-semibold text-primary">
                      Browse all services
                    </button>
                  </div>
                )
              ) : (
                <>
                  <CommandPrimitive.Group heading="Popular" className={groupClass}>
                    {QUICK_ACCESS.map((id) => serviceById(id)!).map((s) => (
                      <CommandPrimitive.Item key={s.id} value={`quick-${s.id}`} onSelect={() => go(s.action.path)} className={itemClass}>
                        <s.icon className="h-4 w-4 text-primary" />
                        <span className="flex-1">{s.action.label}</span>
                        <span className="text-xs text-muted-foreground">{s.name}</span>
                      </CommandPrimitive.Item>
                    ))}
                  </CommandPrimitive.Group>
                  {CATEGORIES.map((c) => (
                    <CommandPrimitive.Group key={c.key} heading={c.title} className={groupClass}>
                      {SERVICES.filter((s) => s.category === c.key).map((s) => (
                        <CommandPrimitive.Item key={s.id} value={`cat-${s.id}`} onSelect={() => go(s.path)} className={itemClass}>
                          <s.icon className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1">{s.name}</span>
                        </CommandPrimitive.Item>
                      ))}
                    </CommandPrimitive.Group>
                  ))}
                  <CommandPrimitive.Group className={groupClass}>
                    <CommandPrimitive.Item value="hub" onSelect={() => go("/services")} className={cn(itemClass, "font-semibold text-primary")}>
                      <LayoutGrid className="h-4 w-4" /> Open the Service Hub
                    </CommandPrimitive.Item>
                  </CommandPrimitive.Group>
                </>
              )}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </DialogContent>
      </Dialog>
    </SearchContext.Provider>
  );
}

/** The search bar/button that opens service search. */
export function SearchTrigger({ className, large = false, label = "Search services" }: { className?: string; large?: boolean; label?: string }) {
  const { open } = useServiceSearch();
  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        "group flex items-center gap-2 rounded-full border border-border bg-background/70 text-left text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground",
        large ? "h-14 w-full px-5 text-base shadow-sm" : "h-9 px-3 text-xs",
        className,
      )}
    >
      <Search className={large ? "h-5 w-5 text-primary" : "h-4 w-4"} aria-hidden />
      <span className="flex-1 truncate">{large ? "What do you need today? Search any Isoko service…" : label}</span>
      <kbd className={cn("hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline", large && "text-xs")}>Ctrl K</kbd>
    </button>
  );
}
