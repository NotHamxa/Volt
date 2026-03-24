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

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
                    <AlertTriangle size={32} className="text-white/20" strokeWidth={1.5} />
                    <p className="text-[13px] text-white/40 text-center">Something went wrong.</p>
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
