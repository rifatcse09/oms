import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { BrandProvider } from "./context/BrandContext";
import { CatalogProvider } from "./context/CatalogContext";
import { OrdersProvider } from "./context/OrdersContext";
import "./index.css";

/** Must match Vite `base` / `VITE_BASE_URL` (e.g. `/hmc` when the app lives at https://host/hmc/). */
function routerBasename(): string | undefined {
  const trimmed = import.meta.env.BASE_URL.replace(/\/$/, "");
  return trimmed === "" ? undefined : trimmed;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={routerBasename()}>
      <AuthProvider>
        <BrandProvider>
          <CatalogProvider>
            <OrdersProvider>
              <App />
            </OrdersProvider>
          </CatalogProvider>
        </BrandProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
