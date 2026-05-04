import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initializeSupabaseAuth } from "@/lib/supabaseAuth";

void initializeSupabaseAuth().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
