import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import api from "../api/client";
import AuthLayout from "../components/AuthLayout";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Verifying your email...");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError("Missing verification token");
      setMessage("");
      return;
    }

    async function verify() {
      try {
        const { data } = await api.get("/auth/verify-email", { params: { token } });
        setMessage(data.message);
      } catch (err) {
        setError(err.response?.data?.detail || "Could not verify email");
        setMessage("");
      }
    }

    verify();
  }, [searchParams]);

  return (
    <AuthLayout title="Verify email" subtitle="Finish account setup">
      <div className="space-y-4">
        {message ? <p className="text-sm text-stone-700">{message}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Link
          className="inline-flex h-11 items-center rounded-md bg-ink px-4 text-sm font-semibold text-white"
          to="/login"
        >
          Go to login
        </Link>
      </div>
    </AuthLayout>
  );
}
