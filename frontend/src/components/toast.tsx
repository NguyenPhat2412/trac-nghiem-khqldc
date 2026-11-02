"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/* System notices render in one fixed stack and slide in from the right edge. */
export function ToastRegion() {
  return <div id="toast-region" className="toast-region" />;
}

export function Toast({
  className = "",
  role = "status",
  onClose,
  closeLabel = "Đóng thông báo",
  children,
}: {
  className?: string;
  role?: "status" | "alert";
  onClose?: () => void;
  closeLabel?: string;
  children: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.getElementById("toast-region")), []);
  if (!host) return null;
  return createPortal(
    <div role={role} className={`toast ${className}`}>
      {children}
      {onClose && (
        <button
          type="button"
          className="toast-close"
          aria-label={closeLabel}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      )}
    </div>,
    host,
  );
}
