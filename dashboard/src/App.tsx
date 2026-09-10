import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Devices from "./pages/Devices";
import DeviceDetail from "./pages/DeviceDetail";
import ProtectedRoute from "./components/ProtectedRoute";

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
      <Route path="*" element={<Navigate to="/devices" replace />} />
    </Routes>
  );
}
