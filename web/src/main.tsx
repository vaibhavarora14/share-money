import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import App from "./App.tsx";
import "./index.css";

// SpeedInsights temporarily disabled due to React 19.2 compatibility issue
// @vercel/speed-insights@1.3.1 depends on React 19.1.0, causing hook errors
// TODO: Re-enable when @vercel/speed-insights supports React 19.2+
// import { SpeedInsights } from "@vercel/speed-insights/react";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
);
