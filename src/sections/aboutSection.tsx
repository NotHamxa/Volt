import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Mail, Globe, ExternalLink, RefreshCw, Check } from "lucide-react";
import { Spinner } from "@/components/ui/spinner.tsx";
import { GitHub } from "@/components/icons/github.tsx";
import { LinkedIn } from "@/components/icons/linkedin.tsx";
export default function AboutSection() {
    const [appVersion, setAppVersion] = useState("");
    const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "downloading" | "ready" | "uptodate">("idle");
    const [downloadPercent, setDownloadPercent] = useState(0);

    useEffect(() => {
        window.electron.getAppVersion().then(setAppVersion);

        window.electron.onUpdateProgress((data) => {
            setUpdateStatus("downloading");
            setDownloadPercent(Math.round(data.percent));
        });
        window.electron.onUpdateDownloaded(() => {
            setUpdateStatus("ready");
        });
        window.electron.onUpdateNotAvailable(() => {
            setUpdateStatus("uptodate");
            setTimeout(() => setUpdateStatus("idle"), 3000);
        });
    }, []);

    const handleCheckUpdate = async () => {
        setUpdateStatus("checking");
        await window.electron.checkForUpdates();
    };

    const socialLinks = [
        { name: "GitHub", icon: GitHub, url: "https://github.com/NotHamxa", label: "@NotHamxa" },
        { name: "LinkedIn", icon: LinkedIn, url: "https://www.linkedin.com/in/hamzahmed07", label: "Hamza Ahmed" },
        { name: "Email", icon: Mail, url: "mailto:hamxa.ahmed2007@gmail.com", label: "hamxa.ahmed2007@gmail.com" },
        { name: "Porfolio", icon: Globe, url: "https://hamzahmed.com", label: "hamzahmed.com" }
    ];

    const updateButtonContent = () => {
        switch (updateStatus) {
            case "checking": return <><Spinner /> Checking...</>;
            case "downloading": return <><RefreshCw size={14} className="animate-spin" /> Downloading {downloadPercent}%</>;
            case "ready": return <><Check size={14} /> Install & Restart</>;
            case "uptodate": return <><Check size={14} className="text-green-400" /> Up to date</>;
            default: return <><RefreshCw size={14} /> Check for Updates</>;
        }
    };

    return (
        <div className="space-y-6">
            <p className="text-[12px] text-white/40 leading-relaxed">Application info and developer contact.</p>

            <div className="space-y-2">
                <div className="px-4 py-3 rounded-lg bg-white/[0.025] border border-white/[0.05] hover:border-white/[0.09] transition-colors">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h3 className="text-[12.5px] font-medium text-white/80 mb-0.5">Application Version</h3>
                            <p className="text-[11px] text-white/35">Current release build</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="px-2 py-1 rounded-md bg-white/[0.05] border border-white/[0.08]">
                                <span className="text-white/60 font-mono text-[11px]">v{appVersion}</span>
                            </div>
                            <Button
                                variant="outline"
                                className="rounded-md text-[11px] text-white/55 hover:text-white/85 hover:bg-white/[0.05] transition-colors border-white/[0.08] h-8 px-3 gap-1.5"
                                onClick={updateStatus === "ready" ? () => window.electron.quitAndInstall() : handleCheckUpdate}
                                disabled={updateStatus === "checking" || updateStatus === "downloading"}
                            >
                                {updateButtonContent()}
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="px-4 py-3 rounded-lg bg-white/[0.025] border border-white/[0.05] hover:border-white/[0.09] transition-colors">
                    <h3 className="text-[12.5px] font-medium text-white/80 mb-1.5">Developer</h3>
                    <p className="text-[12px] text-white/65">Hamza Ahmed</p>
                </div>

                <div className="px-4 py-3 rounded-lg bg-white/[0.025] border border-white/[0.05]">
                    <h3 className="text-[12.5px] font-medium text-white/80 mb-2">Connect</h3>
                    <div className="space-y-0.5">
                        {socialLinks.map((link, index) => {
                            const Icon = link.icon;
                            return (
                                <div
                                    key={index}
                                    className="flex items-center justify-between px-2 py-2 rounded-md transition-all group border border-transparent hover:bg-white/[0.035] hover:border-white/[0.06] cursor-pointer"
                                    onClick={() => window.electron.openExternal(link.url)}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 rounded-md text-white/40 group-hover:text-white/65 transition-colors bg-white/[0.04] border border-white/[0.07]">
                                            <Icon size={12} strokeWidth={1.8} />
                                        </div>
                                        <div>
                                            <p className="text-[12px] font-medium text-white/75">{link.name}</p>
                                            <p className="text-[10px] text-white/30">{link.label}</p>
                                        </div>
                                    </div>
                                    <ExternalLink size={12} className="text-white/20 group-hover:text-white/50 transition-colors" />
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="px-4 py-3 rounded-lg bg-white/[0.025] border border-white/[0.05] hover:border-white/[0.09] transition-colors">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h3 className="text-[12.5px] font-medium text-white/80 mb-0.5">License & Credits</h3>
                            <p className="text-[11px] text-white/35">View source on GitHub.</p>
                        </div>
                        <Button
                            variant="outline"
                            className="rounded-md text-[11px] text-white/55 hover:text-white/85 hover:bg-white/[0.05] transition-colors border-white/[0.08] h-8 px-3"
                            onClick={() => window.electron.openExternal("https://github.com/NotHamxa/volt")}
                        >
                            <GitHub className="mr-1.5" />
                            Repository
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
