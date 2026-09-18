import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Devices from "./pages/Devices";
import DeviceDetail from "./pages/DeviceDetail";
import DeviceSettings from "./pages/DeviceSettings";
import AdminFirmware from "./pages/AdminFirmware";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
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
  );
}
