import { Button } from "@/components/ui/button.tsx";
import { Github, Mail, Globe, ExternalLink } from "lucide-react";

export default function AboutSection() {
    const appVersion = "1.0.3";

    const socialLinks = [
        {
            name: "GitHub",
            icon: Github,
            url: "https://github.com/NotHamxa",
            label: "@NotHamxa"
        },
        {
            name: "LinkedIn",
            icon: Globe,
            url: "https://www.linkedin.com/in/hamzahmed07",
            label: "Hamza Ahmed"
        },
        {
            name: "Email",
            icon: Mail,
            url: "mailto:hamxa.ahmed2007@gmail.com",
            label: "hamxa.ahmed2007@gmail.com"
        },
        {
            name: "Website",
            icon: Globe,
            url: "https://hamzahmed.com",
            label: "hamzahmed.com"
        }
    ];

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <header>
                <h2 className="text-[22px] font-semibold text-white tracking-tight mb-1.5" style={{ letterSpacing: "-0.03em" }}>About</h2>
                <p className="text-white/40 text-[13px]">Some more about me</p>
            </header>

            <div className="space-y-6">
                <div className="px-5 py-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-[13px] font-medium text-white/80 mb-0.5">Application Version</h3>
                            <p className="text-[12px] text-white/35">Current release build</p>
                        </div>
                        <div className="px-3 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}>
                            <span className="text-white/55 font-mono text-[12px]">v{appVersion}</span>
                        </div>
                    </div>
                </div>

                <div className="px-5 py-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <h3 className="text-[13px] font-medium text-white/80 mb-3">Developer</h3>
                    <div className="space-y-3">
                        <div>
                            <p className="text-[13px] text-white/70">Hamza Ahmed</p>
                        </div>
                        <div>
                            <p className="text-[12px] text-white/35 mb-1">About</p>
                            {/*<p className="text-gray-300 text-sm leading-relaxed">*/}
                            {/*    Add your bio or description here. This is a brief introduction about yourself*/}
                            {/*    and your work. You can mention your background, interests, and what drives you*/}
                            {/*    to create applications like this.*/}
                            {/*</p>*/}
                        </div>
                    </div>
                </div>

                <div className="px-5 py-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <h3 className="text-[13px] font-medium text-white/80 mb-3">Connect</h3>
                    <div className="space-y-1">
                        {socialLinks.map((link, index) => {
                            const Icon = link.icon;
                            return (
                                <a
                                    key={index}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between px-3 py-2.5 rounded-lg transition-all group"
                                    style={{ border: "1px solid transparent" }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)"; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "transparent"; }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 rounded-lg text-white/35 group-hover:text-white/60 transition-colors" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                                            <Icon size={15} />
                                        </div>
                                        <div>
                                            <p className="text-[13px] font-medium text-white/75">{link.name}</p>
                                            <p className="text-[11px] text-white/30">{link.label}</p>
                                        </div>
                                    </div>
                                    <ExternalLink size={14} className="text-white/20 group-hover:text-white/45 transition-colors" />
                                </a>
                            );
                        })}
                    </div>
                </div>
                <div className="px-5 py-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <h3 className="text-[13px] font-medium text-white/80 mb-3">License & Credits</h3>
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            className="rounded-lg text-[13px] text-white/50 hover:text-white/75 hover:bg-white/8 transition-colors"
                            style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                            onClick={() => window.open("https://github.com/NotHamxa/volt", "_blank")}
                        >
                            <Github/>
                            View Repository
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}