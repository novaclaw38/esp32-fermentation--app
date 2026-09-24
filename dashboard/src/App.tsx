import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Devices from "./pages/Devices";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";

// Login and the device list are the two first-paint routes and stay in the
// main chunk. Everything else loads on first visit, so signing in doesn't
// download the settings forms or the admin console.
const DeviceDetail = lazy(() => import("./pages/DeviceDetail"));
const DeviceSettings = lazy(() => import("./pages/DeviceSettings"));
const AdminFirmware = lazy(() => import("./pages/AdminFirmware"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Sniffer = lazy(() => import("./pages/Sniffer"));

function PageFallback() {
  return (
    <p role="status" className="p-8 text-panel-400">
      Loading…
    </p>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/devices"
          element={
            <ProtectedRoute>
              <Devices />
            </ProtectedRoute>
          }
        />
        <Route
          path="/devices/:deviceId"
          element={
            <ProtectedRoute>
              <DeviceDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/devices/:deviceId/settings"
          element={
            <ProtectedRoute>
              <DeviceSettings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sniffer"
          element={
            <ProtectedRoute>
              <Sniffer />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/firmware"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <AdminFirmware />
              </AdminRoute>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/devices" replace />} />
      </Routes>
    </Suspense>
  );
}
