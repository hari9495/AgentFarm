"use client";

import { Toaster } from "react-hot-toast";

export default function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: "#0f172a",
          color: "#f8fafc",
          fontSize: "14px",
          borderRadius: "10px",
          padding: "12px 16px",
        },
        success: {
          iconTheme: { primary: "#2563eb", secondary: "#fff" },
        },
        error: {
          iconTheme: { primary: "#ef4444", secondary: "#fff" },
        },
      }}
    />
  );
}

