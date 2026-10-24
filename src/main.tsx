import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/noto-sans-arabic/400.css";
import "@fontsource/noto-sans-arabic/600.css";
import "@fontsource/noto-sans-arabic/700.css";
import "@fontsource/caveat/600.css";
import "./styles/global.css";
import "./styles/components.css";
import "./styles/screens.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { AuthProvider, ChildProvider, ProgressProvider } from "./app/state";
import { I18nProvider } from "./i18n";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <AuthProvider>
          <ChildProvider>
            <ProgressProvider>
              <App />
            </ProgressProvider>
          </ChildProvider>
        </AuthProvider>
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>
);
