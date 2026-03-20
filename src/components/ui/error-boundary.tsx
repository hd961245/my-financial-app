"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || "未知錯誤" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ""}]`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
          <p className="font-semibold mb-1">
            {this.props.name ? `「${this.props.name}」載入失敗` : "此區塊發生錯誤"}
          </p>
          <p className="text-xs text-red-400/70 font-mono">{this.state.message}</p>
          <button
            className="mt-2 text-xs underline hover:text-red-300"
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            重試
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
