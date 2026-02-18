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
                <h2 className="text-3xl font-semibold text-white tracking-tight mb-2">About</h2>
                <p className="text-gray-400 text-sm">Some more about me</p>
            </header>

            <div className="space-y-6">
                <div className="p-6 rounded-xl border border-white/10 bg-white/3">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-medium text-white mb-1">Application Version</h3>
                            <p className="text-sm text-gray-400">Current release build</p>
                        </div>
                        <div className="px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <span className="text-blue-400 font-mono text-sm">v{appVersion}</span>
                        </div>
                    </div>
                </div>

                <div className="p-6 rounded-xl border border-white/10 bg-white/3">
                    <h3 className="font-medium text-white mb-3">Developer</h3>
                    <div className="space-y-3">
                        <div>
                            <p className="text-white">Hamza Ahmed</p> {/* Replace with your name */}
                        </div>
                        <div>
                            <p className="text-sm text-gray-400 mb-1">About</p>
                            {/*<p className="text-gray-300 text-sm leading-relaxed">*/}
                            {/*    Add your bio or description here. This is a brief introduction about yourself*/}
                            {/*    and your work. You can mention your background, interests, and what drives you*/}
                            {/*    to create applications like this.*/}
                            {/*</p>*/}
                        </div>
                    </div>
                </div>

                <div className="p-6 rounded-xl border border-white/10 bg-white/3">
                    <h3 className="font-medium text-white mb-4">Connect</h3>
                    <div className="space-y-3">
                        {socialLinks.map((link, index) => {
                            const Icon = link.icon;
                            return (
                                <a
                                    key={index}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-all group border border-transparent hover:border-white/10"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-white/10 text-gray-400 group-hover:text-white transition-colors">
                                            <Icon size={18} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-white">{link.name}</p>
                                            <p className="text-xs text-gray-400">{link.label}</p>
                                        </div>
                                    </div>
                                    <ExternalLink size={16} className="text-gray-500 group-hover:text-gray-300 transition-colors" />
                                </a>
                            );
                        })}
                    </div>
                </div>
                <div className="p-6 rounded-xl border border-white/10 bg-white/3">
                    <h3 className="font-medium text-white mb-3">License & Credits</h3>
                    <p className="text-sm text-gray-400 leading-relaxed mb-4">

                    </p>
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            className="rounded-lg border-white/10 hover:bg-white/10"
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