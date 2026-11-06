import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import AdminAvailabilityPage from "./pages/AdminAvailabilityPage.tsx";

const isAdminPage =
    window.location.pathname === "/admin" ||
    window.location.pathname === "/admin/";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        {isAdminPage ? <AdminAvailabilityPage /> : <App />}
    </StrictMode>,
);