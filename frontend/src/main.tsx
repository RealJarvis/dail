import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import AdminAvailabilityPage from "./pages/AdminAvailabilityPage.tsx";

const normalizedPath =
    window.location.pathname.replace(/\/+$/, "");

const isAdminPage =
    window.location.hash === "#/admin" ||
    normalizedPath === "/admin";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        {isAdminPage
            ? <AdminAvailabilityPage />
            : <App />}
    </StrictMode>,
);