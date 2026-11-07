import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useSeo } from "@/lib/seo";

const NotFound = () => {
  const location = useLocation();
  // Vercel already answers addresses the site doesn't have with status 404
  // (404.html); this covers made-up addresses inside the app's own sections
  useSeo({ title: "Page not found", description: "This page doesn't exist.", noindex: true });

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
