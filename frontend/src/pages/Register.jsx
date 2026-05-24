import { useState } from "react";
import { Link } from "react-router-dom";

import AuthLayout from "../components/AuthLayout";
import Field from "../components/Field";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    register_as_admin: false,
    admin_code: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const data = await register(form);
      setSuccess(data.message);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not create account");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Create account" subtitle="Start a simple realtime social chat">
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field
          label="Username"
          value={form.username}
          onChange={(event) => setForm({ ...form, username: event.target.value })}
          minLength={3}
          required
        />
        <Field
          label="Email"
          type="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          required
        />
        <Field
          label="Password"
          type="password"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          minLength={6}
          required
        />
        <label className="flex items-center gap-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={form.register_as_admin}
            onChange={(event) =>
              setForm({
                ...form,
                register_as_admin: event.target.checked,
                admin_code: event.target.checked ? form.admin_code : "",
              })
            }
          />
          Register as admin
        </label>
        {form.register_as_admin ? (
          <Field
            label="Admin code"
            type="password"
            value={form.admin_code}
            onChange={(event) => setForm({ ...form, admin_code: event.target.value })}
            required
          />
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {success ? <p className="text-sm text-teal">{success}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="h-11 w-full rounded-md bg-ink px-4 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Creating..." : "Create account"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-stone-600">
        Already have an account?{" "}
        <Link className="font-semibold text-teal" to="/login">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
