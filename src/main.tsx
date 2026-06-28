import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/legacy.css";
import "./styles/icons.css";
import "./styles/additions.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <App />,
);
