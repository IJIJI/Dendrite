// The brand fonts, self-hosted (no third-party request): only the weights the editor uses.
import "@fontsource/archivo/400.css";
import "@fontsource/archivo/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/400-italic.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/kode-mono/500.css";
import "@dendrite-lang/editor/style.css";
import "./style.css";

import { getTheme } from "@dendrite-lang/editor";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

getTheme(); // applies a remembered theme before the first paint

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
