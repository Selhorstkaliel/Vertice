import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// O build gera o HTML de cada rota; em desenvolvimento a página começa vazia.
if (root.firstChild) hydrateRoot(root, app);
else createRoot(root).render(app);
