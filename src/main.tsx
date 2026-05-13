import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initializeLocalSession } from "@/lib/localSession";

void initializeLocalSession().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
