import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute() {
  const { token, loading } = useAuth();

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-sm text-stone-500">Loading...</div>;
  }

  return token ? <Outlet /> : <Navigate to="/login" replace />;
}
