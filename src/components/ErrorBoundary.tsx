import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    // Swallowing the error entirely left "Something went wrong" as the only
    // clue. Log it, and in development show it — the renderer console isn't
    // visible unless DevTools happens to be open.
    componentDidCatch(error: Error, info: { componentStack?: string | null }) {
        console.error("Render error:", error, info.componentStack);
        window.electron?.log?.(`Render error: ${error?.stack ?? error?.message ?? error}`);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
                    <AlertTriangle size={32} className="text-white/20" strokeWidth={1.5} />
                    <p className="text-[13px] text-white/40 text-center">Something went wrong.</p>
                    {import.meta.env.DEV && this.state.error && (
                        <pre className="max-h-40 w-full overflow-auto rounded-lg bg-black/40 border border-white/[0.08] p-2 text-[10px] leading-relaxed text-red-300/70 whitespace-pre-wrap">
                            {this.state.error.message}
                        </pre>
                    )}
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] text-white/50 hover:text-white/70 bg-white/[0.06] border border-white/10 hover:bg-white/[0.08] transition-colors"
                    >
                        <RefreshCw size={13} />
                        Try again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
