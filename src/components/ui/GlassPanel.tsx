"use client";

import * as React from "react";

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "strong";
  padding?: "none" | "sm" | "md" | "lg";
  as?: React.ElementType;
}

const PADDING = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export function GlassPanel({
  variant = "default",
  padding = "md",
  as: Tag = "div",
  className = "",
  children,
  ...rest
}: GlassPanelProps) {
  const base = variant === "strong" ? "glass-strong" : "glass";
  return (
    <Tag
      className={`${base} rounded-lg ${PADDING[padding]} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function SectionHeader({
  icon,
  title,
  meta,
  actions,
}: {
  icon?: React.ReactNode;
  title: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2 min-w-0">
        {icon && <div className="text-text-muted shrink-0">{icon}</div>}
        <h3 className="text-sm font-semibold text-text tracking-normal truncate">{title}</h3>
        {meta && <div className="text-xs text-text-muted shrink-0">{meta}</div>}
      </div>
      {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
    </div>
  );
}

export function IconButton({
  title,
  onClick,
  children,
  active,
  disabled,
}: {
  title?: string;
  onClick?: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`w-7 h-7 inline-flex items-center justify-center rounded-md transition-all ${
        active
          ? "bg-accent-glow text-accent border border-accent/25"
          : "text-text-muted hover:text-text hover:bg-bg-deep border border-transparent"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}
